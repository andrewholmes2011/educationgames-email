import type {Env,AuthUser} from "./types";
import {error,json,validCommgaAddress} from "./security";
function escapeHtml(value:string):string{return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}

async function hashToken(token:string):Promise<string>{
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function newToken():string{
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 return [...bytes].map(x=>x.toString(16).padStart(2,"0")).join("");
}
export async function listGroups(env:Env,user:AuthUser):Promise<Response>{
 const rows=await env.DB.prepare("SELECT g.id,g.name,g.address FROM mail_groups g JOIN mail_group_members m ON m.group_id=g.id WHERE m.user_id=? AND g.enabled=1 ORDER BY g.name COLLATE NOCASE").bind(user.id).all();
 return json({groups:rows.results||[]});
}
export async function adminGroups(env:Env):Promise<Response>{
 const rows=await env.DB.prepare("SELECT g.id,g.name,g.address,g.enabled,COUNT(m.user_id) AS member_count FROM mail_groups g LEFT JOIN mail_group_members m ON m.group_id=g.id GROUP BY g.id ORDER BY g.name COLLATE NOCASE").all<any>();
 const groups=[];
 for(const g of rows.results||[]){
  const members=await env.DB.prepare("SELECT u.id,u.display_name,u.email_alias FROM mail_group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=? ORDER BY u.display_name COLLATE NOCASE").bind(g.id).all();
  groups.push({...g,members:members.results||[]});
 }
 return json({groups});
}
export async function createGroup(request:Request,env:Env,admin:AuthUser):Promise<Response>{
 const body=await request.json() as {name?:string;address?:string;member_ids?:string[]};
 const name=(body.name||"").trim().slice(0,80),address=(body.address||"").trim().toLowerCase(),ids=Array.isArray(body.member_ids)?[...new Set(body.member_ids.filter(x=>typeof x==="string"))]:[];
 if(!name)return error("A group name is required.");
 if(!validCommgaAddress(address))return error("Use a valid @commga.com group address.");
 if(!ids.length||ids.length>100)return error("Select between 1 and 100 group members.");
 const conflict=await env.DB.prepare("SELECT email_alias AS address FROM users WHERE email_alias=? COLLATE NOCASE UNION SELECT address FROM sender_identities WHERE address=? COLLATE NOCASE UNION SELECT address FROM mail_groups WHERE address=? COLLATE NOCASE").bind(address,address,address).first();
 if(conflict)return error("That address is already in use.");
 const valid=await env.DB.prepare("SELECT id FROM users WHERE status='active' AND id IN ("+ids.map(()=>"?").join(",")+")").bind(...ids).all<{id:string}>();
 if((valid.results||[]).length!==ids.length)return error("One or more selected accounts are unavailable.");
 const id=crypto.randomUUID();
 await env.DB.prepare("INSERT INTO mail_groups (id,name,address,created_by) VALUES (?,?,?,?)").bind(id,name,address,admin.id).run();
 for(const member of ids)await env.DB.prepare("INSERT INTO mail_group_members (group_id,user_id) VALUES (?,?)").bind(id,member).run();
 return json({ok:true,id},201);
}
export async function removeGroupMember(env:Env,groupId:string,userId:string):Promise<Response>{
 const group=await env.DB.prepare("SELECT id FROM mail_groups WHERE id=?").bind(groupId).first();
 if(!group)return error("Group mailbox not found.",404);
 const member=await env.DB.prepare("SELECT 1 AS found FROM mail_group_members WHERE group_id=? AND user_id=?").bind(groupId,userId).first();
 if(!member)return error("That account is not a member of this group.",404);
 const count=await env.DB.prepare("SELECT COUNT(*) AS total FROM mail_group_members WHERE group_id=?").bind(groupId).first<{total:number}>();
 if((count?.total||0)<=1)return error("A shared inbox must have at least one member. Add another member before removing this one.");
 await env.DB.batch([
  env.DB.prepare("DELETE FROM group_invites WHERE group_id=? AND invited_user_id=?").bind(groupId,userId),
  env.DB.prepare("DELETE FROM mail_group_members WHERE group_id=? AND user_id=?").bind(groupId,userId)
 ]);
 return json({ok:true});
}
export async function deleteGroup(env:Env,id:string):Promise<Response>{
 const group=await env.DB.prepare("SELECT id FROM mail_groups WHERE id=?").bind(id).first();
 if(!group)return error("Group mailbox not found.",404);
 await env.DB.batch([
  env.DB.prepare("DELETE FROM group_invites WHERE group_id=?").bind(id),
  env.DB.prepare("DELETE FROM mail_group_members WHERE group_id=?").bind(id),
  env.DB.prepare("DELETE FROM mail_groups WHERE id=?").bind(id)
 ]);
 return json({ok:true});
}
export async function inviteToGroup(request:Request,env:Env,admin:AuthUser,groupId:string):Promise<Response>{
 const body=await request.json() as {user_id?:string},userId=(body.user_id||"").trim();
 if(!userId)return error("Choose an account to invite.");
 const group=await env.DB.prepare("SELECT id,name,address FROM mail_groups WHERE id=? AND enabled=1").bind(groupId).first<{id:string;name:string;address:string}>();
 if(!group)return error("Active group mailbox not found.",404);
 const target=await env.DB.prepare("SELECT id,email_alias,display_name FROM users WHERE id=? AND status='active'").bind(userId).first<{id:string;email_alias:string;display_name:string}>();
 if(!target)return error("The selected account is unavailable.");
 const member=await env.DB.prepare("SELECT 1 AS found FROM mail_group_members WHERE group_id=? AND user_id=?").bind(groupId,userId).first();
 if(member)return error("That account is already a member of this group.");
 const rawToken=newToken(),tokenHash=await hashToken(rawToken),expires=Math.floor(Date.now()/1000)+7*24*60*60;
 const inviteId=crypto.randomUUID(),now=new Date().toISOString(),url=new URL("/group-invite/"+rawToken,request.url).toString();
 await env.DB.prepare("INSERT INTO group_invites (id,token_hash,group_id,invited_user_id,invited_by,expires_at) VALUES (?,?,?,?,?,?)").bind(inviteId,tokenHash,groupId,userId,admin.id,expires).run();
 const subject="Invitation to join "+group.name;
 const bodyText="You have been invited by "+admin.display_name+" to join the shared group inbox "+group.name+" ("+group.address+").\n\nAccept invitation: "+url+"\n\nIf the button does not work, copy and paste this link into your browser:\n"+url+"\n\nThis invitation expires in 7 days and can only be accepted by the invited account.\n\nEducationGames Mail";
  const esc=escapeHtml;
 const bodyHtml='<div class="invite-email"><p>Hello '+esc(target.display_name)+',</p><p>You have been invited to join <strong>'+esc(group.name)+'</strong> ('+esc(group.address)+').</p><p><a class="email-cta" href="'+url+'">Accept invitation</a></p><p>If the button does not work, copy and paste this link into your browser:</p><p><a href="'+url+'">'+url+'</a></p><p>This invitation expires in 7 days and can only be accepted by the invited account.</p><p>EducationGames Mail</p></div>';
 await env.DB.prepare("INSERT INTO messages (id,owner_id,direction,folder,from_address,to_addresses,cc_addresses,subject,text_body,html_body,message_id,is_read,sent_at,received_at) VALUES (?,?,'inbound','inbox',?,?, '[]',?,?,?,?,0,?,?)").bind(crypto.randomUUID(),userId,admin.email_alias,JSON.stringify([target.email_alias]),subject,bodyText,bodyHtml,crypto.randomUUID(),now,now).run();
 return json({ok:true,recipient:target.email_alias},201);
}
async function getGroupInvite(env:Env,user:AuthUser,token:string):Promise<Response>{
 const tokenHash=await hashToken(token),row=await env.DB.prepare("SELECT i.id,i.expires_at,i.accepted_at,g.id AS group_id,g.name,g.address,u.email_alias AS invited_email FROM group_invites i JOIN mail_groups g ON g.id=i.group_id JOIN users u ON u.id=i.invited_user_id WHERE i.token_hash=? AND i.invited_user_id=? AND g.enabled=1 AND u.status='active'").bind(tokenHash,user.id).first<any>();
 if(!row)return error("This invitation is invalid or belongs to another account.",404);
 if(row.accepted_at)return error("This invitation has already been accepted.",409);
 if(row.expires_at<Math.floor(Date.now()/1000))return error("This invitation has expired.",410);
 return json({invite:{group_name:row.name,group_address:row.address,email:row.invited_email}});
}
async function acceptGroupInvite(env:Env,user:AuthUser,token:string):Promise<Response>{
 const tokenHash=await hashToken(token),row=await env.DB.prepare("SELECT i.id,i.group_id,i.expires_at,i.accepted_at FROM group_invites i JOIN mail_groups g ON g.id=i.group_id WHERE i.token_hash=? AND i.invited_user_id=? AND g.enabled=1").bind(tokenHash,user.id).first<any>();
 if(!row)return error("This invitation is invalid or belongs to another account.",404);
 if(row.accepted_at)return error("This invitation has already been accepted.",409);
 if(row.expires_at<Math.floor(Date.now()/1000))return error("This invitation has expired.",410);
 const now=Math.floor(Date.now()/1000);
 await env.DB.batch([
  env.DB.prepare("INSERT OR IGNORE INTO mail_group_members (group_id,user_id) VALUES (?,?)").bind(row.group_id,user.id),
  env.DB.prepare("UPDATE group_invites SET accepted_at=? WHERE id=? AND accepted_at IS NULL").bind(now,row.id)
 ]);
 return json({ok:true});
}
export async function groupInviteRoute(request:Request,env:Env,user:AuthUser,token:string,accept:boolean):Promise<Response>{
 return accept?acceptGroupInvite(env,user,token):getGroupInvite(env,user,token);
}
