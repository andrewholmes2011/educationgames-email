import type {Env,AuthUser} from "./types";
import {cleanFilename,error,json,validEmail,validCommgaAddress} from "./security";
import {sanitizeNewsletterHtml} from "./newsletters";
const CHUNK_BYTES=128*1024;
async function resolveInternalRecipients(address:string,env:Env):Promise<Array<{address:string;id:string}>|null>{
 const normalized=address.trim().toLowerCase();if(!validEmail(normalized))return null;
 const user=await env.DB.prepare("SELECT id,email_alias AS address FROM users WHERE email_alias=? COLLATE NOCASE AND status='active'").bind(normalized).first<{id:string;address:string}>();
 if(user)return [user];
 const group=await env.DB.prepare("SELECT id,address FROM mail_groups WHERE address=? COLLATE NOCASE AND enabled=1").bind(normalized).first<{id:string;address:string}>();
 if(group){
  const members=await env.DB.prepare("SELECT u.id,u.email_alias AS address FROM mail_group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=? AND u.status='active'").bind(group.id).all<{id:string;address:string}>();
  return (members.results||[]).map(m=>({id:m.id,address:group.address}));
 }
 const sender=await env.DB.prepare("SELECT u.id,u.email_alias AS address FROM sender_identities s JOIN users u ON u.id=s.reply_to_user_id WHERE s.address=? COLLATE NOCASE AND s.enabled=1 AND u.status='active'").bind(normalized).first<{id:string;address:string}>();
 return sender?[sender]:null;
}
export async function listMessages(request:Request,env:Env,user:AuthUser):Promise<Response>{
 const url=new URL(request.url),folder=url.searchParams.get("folder")||"inbox",allowed=["inbox","sent","drafts","trash","archive"];
 if(!allowed.includes(folder))return error("Invalid folder.");
 const limit=Math.min(100,Math.max(1,Number(url.searchParams.get("limit")||50))),before=url.searchParams.get("before");
 const query="SELECT id,direction,folder,from_address,to_addresses,cc_addresses,subject,substr(text_body,1,500) AS preview,is_read,sent_at,received_at FROM messages WHERE owner_id=? AND folder=? AND datetime(COALESCE(sent_at,received_at,created_at)) >= datetime('now','-90 days') "+(before?"AND received_at < ? ":"")+"ORDER BY received_at DESC LIMIT ?";
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
 const form=await request.formData(),toRaw=String(form.get("to")||""),ccRaw=String(form.get("cc")||""),requestedFrom=String(form.get("from")||"").trim().toLowerCase(),subject=String(form.get("subject")||"").trim().slice(0,998),textBody=String(form.get("text")||"").slice(0,100000),htmlBody=sanitizeNewsletterHtml(String(form.get("html")||""));
 let fromAddress=user.email_alias;
 if(requestedFrom&&requestedFrom!==user.email_alias){
  const group=await env.DB.prepare("SELECT g.address FROM mail_groups g WHERE g.address=? COLLATE NOCASE AND g.enabled=1").bind(requestedFrom).first<{address:string}>();
  if(group){
   if(user.role!=="admin"){
    const member=await env.DB.prepare("SELECT 1 AS ok FROM mail_group_members m JOIN mail_groups g ON g.id=m.group_id WHERE g.address=? COLLATE NOCASE AND m.user_id=? AND g.enabled=1").bind(requestedFrom,user.id).first();
    if(!member)return error("You are not a member of that group mailbox.",403);
   }
   fromAddress=group.address;
  }else{
   const identity=await env.DB.prepare("SELECT address FROM sender_identities WHERE address=? COLLATE NOCASE AND enabled=1").bind(requestedFrom).first<{address:string}>();
   if(!identity)return error("Choose your personal address or an available group/sender address.",403);
   fromAddress=identity.address;
  }
 }
 const recipients=toRaw.split(/[,\s;]+/).map(v=>v.trim()).filter(Boolean),cc=ccRaw.split(/[,\s;]+/).map(v=>v.trim()).filter(Boolean);
 if(!recipients.length||recipients.length>20||cc.length>20)return error("Provide 1–20 To recipients and no more than 20 CC recipients.");
 if(![...recipients,...cc].every(validEmail))return error("One or more recipient email addresses are invalid.");
 if(!subject)return error("Subject is required.");if(!textBody.trim())return error("Message body is required.");
 const internalRecipients:Array<{address:string;id:string}>=[];
 for(const address of [...recipients,...cc]){
  const targets=await resolveInternalRecipients(address,env);
  if(!targets)return error("Only active EducationGames Mail addresses, group addresses, and approved sender identities are allowed. Unknown or external address: "+address,403);
  for(const target of targets){
   if(!internalRecipients.some(r=>r.id===target.id))internalRecipients.push({address:address.toLowerCase(),id:target.id});
  }
 }
 if(internalRecipients.length>200)return error("This message expands to more than 200 mailboxes. Reduce the number of recipients or group members.");
 const maxBytes=Math.min(1024*1024,Math.max(1024,Number(env.MAX_ATTACHMENT_BYTES||1048576))),stored:StoredAttachment[]=[];let total=0;
 for(const value of form.getAll("attachments")){
  if(!(value instanceof File)||value.size===0)continue;
  if(value.size>maxBytes)return error("Attachment "+value.name+" exceeds the per-file size limit of 1 MB.");
  total+=value.size;if(total>maxBytes)return error("Combined attachments exceed the 1 MB message limit.");
  stored.push({id:crypto.randomUUID(),filename:cleanFilename(value.name),type:value.type||"application/octet-stream",size:value.size,bytes:new Uint8Array(await value.arrayBuffer())});
 }
 const sentAt=new Date().toISOString(),messageId=crypto.randomUUID(),sentRowId=crypto.randomUUID();
 await env.DB.prepare("INSERT INTO messages (id,owner_id,direction,folder,from_address,to_addresses,cc_addresses,subject,text_body,html_body,message_id,is_read,sent_at,received_at) VALUES (?,?,'outbound','sent',?,?,?,?,?,?,?,1,?,?)").bind(sentRowId,user.id,fromAddress,JSON.stringify(recipients),JSON.stringify(cc),subject,textBody,htmlBody,messageId,sentAt,sentAt).run();
 for(const file of stored)await storeAttachment(env,user.id,sentRowId,file);
 for(const recipient of internalRecipients){
  const inboxId=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO messages (id,owner_id,direction,folder,from_address,to_addresses,cc_addresses,subject,text_body,html_body,message_id,is_read,sent_at,received_at) VALUES (?,?,'inbound','inbox',?,?,?,?,?,?,?,0,?,?)").bind(inboxId,recipient.id,fromAddress,JSON.stringify([recipient.address]),JSON.stringify(cc),subject,textBody,htmlBody,messageId,sentAt,sentAt).run();
  for(const file of stored)await storeAttachment(env,recipient.id,inboxId,{...file,id:crypto.randomUUID()});
 }
 return json({ok:true,id:sentRowId,delivery:"internal-only"},201);
}

export async function reportMessage(request:Request,env:Env,user:AuthUser,id:string):Promise<Response>{
 const body=await request.json() as {reason?:string;details?:string};
 const message=await env.DB.prepare("SELECT id,owner_id,from_address,to_addresses,subject,text_body,html_body FROM messages WHERE id=? AND owner_id=?").bind(id,user.id).first<any>();
 if(!message)return error("Message not found.",404);
 const reason=String(body.reason||"").trim().slice(0,80),details=String(body.details||"").trim().slice(0,2000);
 if(!["Harassment or bullying","Threats or intimidation","Spam or unwanted messages","Inappropriate content","Impersonation","Other concern"].includes(reason))return error("Choose a valid report reason.");
 const existing=await env.DB.prepare("SELECT id FROM message_reports WHERE message_id=? AND reporter_id=? AND status='open'").bind(id,user.id).first();
 if(existing)return error("You have already reported this message.",409);
 await env.DB.prepare("INSERT INTO message_reports(id,message_id,message_owner_id,reporter_id,reporter_email,message_from,message_to,message_subject,message_text,message_html,reason,details) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),id,message.owner_id,user.id,user.email_alias,message.from_address,message.to_addresses,message.subject,message.text_body,message.html_body,reason,details).run();
 return json({ok:true},201);
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
