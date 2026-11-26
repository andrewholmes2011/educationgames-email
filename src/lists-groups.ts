import type {Env,AuthUser} from "./types";
import {error,json,validEmail} from "./security";

export async function listMailingLists(env:Env,user:AuthUser):Promise<Response>{
 const rows=await env.DB.prepare("SELECT l.id,l.name,COUNT(m.user_id) AS member_count FROM mailing_lists l LEFT JOIN mailing_list_members m ON m.list_id=l.id WHERE l.owner_id=? GROUP BY l.id ORDER BY l.name COLLATE NOCASE").bind(user.id).all<any>();
 const lists=[];
 for(const row of rows.results||[]){
  const members=await env.DB.prepare("SELECT u.id,u.email_alias,u.display_name FROM mailing_list_members m JOIN users u ON u.id=m.user_id WHERE m.list_id=? AND u.status='active' ORDER BY u.display_name COLLATE NOCASE").bind(row.id).all<any>();
  lists.push({...row,members:members.results||[]});
 }
 return json({lists});
}
export async function createMailingList(request:Request,env:Env,user:AuthUser):Promise<Response>{
 const body=await request.json() as {name?:string;member_ids?:string[]};
 const name=(body.name||"").trim().slice(0,60),ids=Array.isArray(body.member_ids)?[...new Set(body.member_ids.filter(x=>typeof x==="string"))]:[];
 if(!name)return error("A list name is required.");
 if(!ids.length||ids.length>100)return error("Select between 1 and 100 active members.");
 const valid=await env.DB.prepare("SELECT id FROM users WHERE status='active' AND id IN ("+ids.map(()=>"?").join(",")+")").bind(...ids).all<{id:string}>();
 if((valid.results||[]).length!==ids.length)return error("One or more selected accounts are unavailable.");
 const id=crypto.randomUUID();
 try{await env.DB.prepare("INSERT INTO mailing_lists (id,owner_id,name) VALUES (?,?,?)").bind(id,user.id,name).run();}
 catch{return error("A list with that name already exists.");}
 for(const member of ids)await env.DB.prepare("INSERT INTO mailing_list_members (list_id,user_id) VALUES (?,?)").bind(id,member).run();
 return json({ok:true,id},201);
}
export async function deleteMailingList(env:Env,user:AuthUser,id:string):Promise<Response>{
 const r=await env.DB.prepare("DELETE FROM mailing_lists WHERE id=? AND owner_id=?").bind(id,user.id).run();
 if(!r.meta.changes)return error("Mailing list not found.",404);
 return json({ok:true});
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
 if(!validEmail(address)||!address.endsWith(".holmes"))return error("Use a valid internal .holmes group address.");
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
export async function deleteGroup(env:Env,id:string):Promise<Response>{
 await env.DB.prepare("UPDATE mail_groups SET enabled=0 WHERE id=?").bind(id).run();
 return json({ok:true});
}
