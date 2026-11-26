import type {Env,AuthUser} from "./types";
import {cleanFilename,error,json,validEmail,validSiteAddress} from "./security";
const CHUNK_BYTES=128*1024;
async function resolveInternalAddress(address:string,env:Env):Promise<string|null>{
 const normalized=address.trim().toLowerCase();if(!validSiteAddress(normalized))return null;
 const exists=await env.DB.prepare("SELECT email_alias FROM users WHERE email_alias=? COLLATE NOCASE AND status='active'").bind(normalized).first<{email_alias:string}>();
 return exists?.email_alias||null;
}
export async function listMessages(request:Request,env:Env,user:AuthUser):Promise<Response>{
 const url=new URL(request.url),folder=url.searchParams.get("folder")||"inbox",allowed=["inbox","sent","drafts","trash","archive"];
 if(!allowed.includes(folder))return error("Invalid folder.");
 const limit=Math.min(100,Math.max(1,Number(url.searchParams.get("limit")||50))),before=url.searchParams.get("before");
 const query="SELECT id,direction,folder,from_address,to_addresses,cc_addresses,subject,substr(text_body,1,500) AS preview,is_read,sent_at,received_at FROM messages WHERE owner_id=? AND folder=? "+(before?"AND received_at < ? ":"")+"ORDER BY received_at DESC LIMIT ?";
 const stmt=env.DB.prepare(query),rows=before?await stmt.bind(user.id,folder,before,limit).all():await stmt.bind(user.id,folder,limit).all();
 return json({messages:rows.results||[]});
}
export async function getMessage(env:Env,user:AuthUser,id:string):Promise<Response>{
 const message=await env.DB.prepare("SELECT * FROM messages WHERE id=? AND owner_id=?").bind(id,user.id).first<any>();
 if(!message)return error("Message not found.",404);
 await env.DB.prepare("UPDATE messages SET is_read=1 WHERE id=? AND owner_id=?").bind(id,user.id).run();
 const attachments=await env.DB.prepare("SELECT id,filename,content_type,size FROM attachments WHERE message_id=? AND owner_id=?").bind(id,user.id).all();
 return json({message,attachments:attachments.results||[]});
}
export async function updateMessage(request:Request,env:Env,user:AuthUser,id:string):Promise<Response>{
 const body=await request.json() as {action?:string;folder?:string};
 const message=await env.DB.prepare("SELECT id FROM messages WHERE id=? AND owner_id=?").bind(id,user.id).first();
 if(!message)return error("Message not found.",404);
 if(body.action==="read")await env.DB.prepare("UPDATE messages SET is_read=1 WHERE id=? AND owner_id=?").bind(id,user.id).run();
 else if(body.action==="unread")await env.DB.prepare("UPDATE messages SET is_read=0 WHERE id=? AND owner_id=?").bind(id,user.id).run();
 else if(body.action==="move"&&["inbox","sent","drafts","trash","archive"].includes(body.folder||""))await env.DB.prepare("UPDATE messages SET folder=? WHERE id=? AND owner_id=?").bind(body.folder,id,user.id).run();
 else if(body.action==="delete")await env.DB.prepare("DELETE FROM messages WHERE id=? AND owner_id=?").bind(id,user.id).run();
 else return error("Unsupported message action.");
 return json({ok:true});
}
type StoredAttachment={id:string;filename:string;type:string;size:number;bytes:Uint8Array};
async function storeAttachment(env:Env,ownerId:string,messageId:string,file:StoredAttachment):Promise<void>{
 await env.DB.prepare("INSERT INTO attachments (id,message_id,owner_id,filename,content_type,size) VALUES (?,?,?,?,?,?)").bind(file.id,messageId,ownerId,file.filename,file.type,file.size).run();
 for(let offset=0,index=0;offset<file.bytes.length;offset+=CHUNK_BYTES,index++){
  const chunk=file.bytes.slice(offset,Math.min(offset+CHUNK_BYTES,file.bytes.length));
  await env.DB.prepare("INSERT INTO attachment_chunks (attachment_id,chunk_index,data) VALUES (?,?,?)").bind(file.id,index,chunk).run();
 }
}
export async function sendMessage(request:Request,env:Env,user:AuthUser):Promise<Response>{
 const form=await request.formData(),toRaw=String(form.get("to")||""),ccRaw=String(form.get("cc")||""),subject=String(form.get("subject")||"").trim().slice(0,998),textBody=String(form.get("text")||"").slice(0,100000);
 const recipients=toRaw.split(/[,\s;]+/).map(v=>v.trim()).filter(Boolean),cc=ccRaw.split(/[,\s;]+/).map(v=>v.trim()).filter(Boolean);
 if(!recipients.length||recipients.length>20||cc.length>20)return error("Provide 1–20 To recipients and no more than 20 CC recipients.");
 if(![...recipients,...cc].every(validEmail))return error("One or more recipient email addresses are invalid.");
 if(!subject)return error("Subject is required.");if(!textBody.trim())return error("Message body is required.");
 const internalRecipients:Array<{address:string;id:string}>=[];
 for(const address of [...recipients,...cc]){
  const internal=await resolveInternalAddress(address,env);
  if(!internal)return error("Only active EducationGames Mail addresses are allowed. Unknown or external address: "+address,403);
  const target=await env.DB.prepare("SELECT id FROM users WHERE email_alias=? COLLATE NOCASE AND status='active'").bind(internal).first<{id:string}>();
  if(!target)return error("Mailbox "+address+" does not exist.",404);
  if(target.id!==user.id&&!internalRecipients.some(r=>r.id===target.id))internalRecipients.push({address:internal,id:target.id});
 }
 const maxBytes=Math.min(1024*1024,Math.max(1024,Number(env.MAX_ATTACHMENT_BYTES||1048576))),stored:StoredAttachment[]=[];let total=0;
 for(const value of form.getAll("attachments")){
  if(!(value instanceof File)||value.size===0)continue;
  if(value.size>maxBytes)return error("Attachment "+value.name+" exceeds the per-file size limit of 1 MB.");
  total+=value.size;if(total>maxBytes)return error("Combined attachments exceed the 1 MB message limit.");
  stored.push({id:crypto.randomUUID(),filename:cleanFilename(value.name),type:value.type||"application/octet-stream",size:value.size,bytes:new Uint8Array(await value.arrayBuffer())});
 }
 const sentAt=new Date().toISOString(),messageId=crypto.randomUUID(),sentRowId=crypto.randomUUID();
 await env.DB.prepare("INSERT INTO messages (id,owner_id,direction,folder,from_address,to_addresses,cc_addresses,subject,text_body,message_id,is_read,sent_at,received_at) VALUES (?,?,'outbound','sent',?,?,?,?,?,?,1,?,?)").bind(sentRowId,user.id,user.email_alias,JSON.stringify(recipients),JSON.stringify(cc),subject,textBody,messageId,sentAt,sentAt).run();
 for(const file of stored)await storeAttachment(env,user.id,sentRowId,file);
 for(const recipient of internalRecipients){
  const inboxId=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO messages (id,owner_id,direction,folder,from_address,to_addresses,cc_addresses,subject,text_body,message_id,is_read,sent_at,received_at) VALUES (?,?,'inbound','inbox',?,?,?,?,?,?,0,?,?)").bind(inboxId,recipient.id,user.email_alias,JSON.stringify([recipient.address]),JSON.stringify(cc),subject,textBody,messageId,sentAt,sentAt).run();
  for(const file of stored)await storeAttachment(env,recipient.id,inboxId,{...file,id:crypto.randomUUID()});
 }
 return json({ok:true,id:sentRowId,delivery:"internal-only"},201);
}
export async function downloadAttachment(env:Env,user:AuthUser,attachmentId:string):Promise<Response>{
 const row=await env.DB.prepare("SELECT filename,content_type,size FROM attachments WHERE id=? AND owner_id=?").bind(attachmentId,user.id).first<{filename:string;content_type:string;size:number}>();
 if(!row)return error("Attachment not found.",404);
 const result=await env.DB.prepare("SELECT data FROM attachment_chunks WHERE attachment_id=? ORDER BY chunk_index").bind(attachmentId).all<{data:ArrayBuffer|Uint8Array}>();
 const chunks=(result.results||[]).map(part=>part.data instanceof Uint8Array?part.data:new Uint8Array(part.data)),actualSize=chunks.reduce((sum,part)=>sum+part.byteLength,0);
 if(actualSize!==row.size)return error("Attachment data is incomplete.",500);
 const bytes=new Uint8Array(actualSize);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}
 const filename=cleanFilename(row.filename).replace(/["\\]/g,"_"),headers=new Headers();
 headers.set("content-type",row.content_type||"application/octet-stream");headers.set("content-disposition",'attachment; filename="'+filename+'"');headers.set("content-length",String(actualSize));headers.set("cache-control","private, no-store");headers.set("x-content-type-options","nosniff");
 return new Response(bytes,{headers});
}
