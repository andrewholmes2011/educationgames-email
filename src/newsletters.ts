import type {Env,AuthUser} from "./types";
import {error,json,randomToken,sha256} from "./security";

function escapeHtml(value:string):string{return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/\x27/g,"&#39;");}
export function sanitizeNewsletterHtml(input:string):string{
 let html=String(input||"").slice(0,60000);
 html=html.replace(/<!--[\s\S]*?-->/g,"").replace(/<(script|style|iframe|object|embed|form|input|button|svg|math|video|audio)[^>]*>[\s\S]*?<\/\1\s*>/gi,"");
 html=html.replace(/<(script|style|iframe|object|embed|form|input|button|svg|math|video|audio)\b[^>]*\/?>/gi,"");
 html=html.replace(/<(?!\/?(?:p|h1|h2|h3|h4|strong|b|em|i|u|s|ul|ol|li|blockquote|hr|br|div|span|font|a|img)\b)[^>]*>/gi,"");
 html=html.replace(/<([a-z0-9]+)\b([^>]*)>/gi,(whole,tag:string,attrs:string)=>{
  const t=tag.toLowerCase();if(t==="font"){const match=attrs.match(/color=([^\s>]+)/i),color=(match?.[1]||"").replace(/["']/g,"");return /^#[0-9a-f]{6}$/i.test(color)?'<font color="'+color+'">':"<font>";}if(!["a","img"].includes(t))return "<"+t+">";
  const read=(name:string)=>{const match=attrs.match(new RegExp("\\b"+name+"\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))","i"));return match?(match[1]??match[2]??match[3]??""):"";};
  if(t==="a"){const href=read("href").trim();if(href.startsWith("//")||!(/^(https:\/\/|http:\/\/|mailto:|\/)/i.test(href)))return "<a>";const cta=/email-cta/i.test(read("class"));return '<a'+(cta?' class="email-cta"':'')+' href="'+escapeHtml(href)+'" target="_blank" rel="noopener noreferrer">';}
  const src=read("src").trim();if(!/^https:\/\//i.test(src))return "";const alt=read("alt");return '<img src="'+escapeHtml(src)+'" alt="'+escapeHtml(alt)+'" loading="lazy">';
 });
 html=html.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,"");
 html=html.replace(/javascript\s*:/gi,"");
 return html;
}
function textFromHtml(html:string):string{return html.replace(/<\s*br\s*\/?>/gi,"\n").replace(/<\/(p|h[1-6]|div|li|blockquote)>/gi,"\n").replace(/<[^>]+>/g,"").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim().slice(0,100000);}
export async function newsletterStatus(env:Env):Promise<Response>{
 const r=await env.DB.prepare("SELECT COUNT(*) AS total FROM users u LEFT JOIN newsletter_preferences p ON p.user_id=u.id WHERE u.status='active' AND (p.unsubscribed_at IS NULL)").first<{total:number}>();
 const d=await env.DB.prepare("SELECT code,display_name FROM districts WHERE enabled=1 ORDER BY display_name").all();
 const campaigns=await env.DB.prepare("SELECT c.id,c.subject,c.audience,c.recipient_count,c.created_at,u.display_name AS created_by FROM newsletter_campaigns c JOIN users u ON u.id=c.created_by ORDER BY c.created_at DESC LIMIT 10").all();
 return json({subscribers:r?.total||0,districts:d.results||[],campaigns:campaigns.results||[]});
}
export async function sendNewsletter(request:Request,env:Env,admin:AuthUser):Promise<Response>{
 let body:any;try{body=await request.json();}catch{return error("Invalid JSON.");}
 const subject=String(body.subject||"").trim().slice(0,180),raw=String(body.html||"");
 if(!subject)return error("Newsletter subject is required.");
 if(raw.length<1||raw.length>60000)return error("Add newsletter content (maximum 60 KB).");
 const html=sanitizeNewsletterHtml(raw);
 if(!textFromHtml(html))return error("Newsletter content is empty after formatting cleanup.");
 const audience=String(body.audience||"all"),district=audience.startsWith("district:")?audience.slice(9):null;
 if(audience!=="all"&&(!district||!await env.DB.prepare("SELECT code FROM districts WHERE code=? AND enabled=1").bind(district).first()))return error("Choose a valid audience.");
 const query="SELECT u.id,u.email_alias,u.display_name,p.token_hash,p.unsubscribed_at FROM users u LEFT JOIN newsletter_preferences p ON p.user_id=u.id WHERE u.status='active' AND (p.unsubscribed_at IS NULL)"+(district?" AND u.district_code=?":"")+" ORDER BY u.email_alias";
 const result=district?await env.DB.prepare(query).bind(district).all<any>():await env.DB.prepare(query).all<any>();
 const recipients=result.results||[];if(!recipients.length)return error("There are no subscribed accounts in this audience.");
 if(recipients.length>1000)return error("This audience exceeds the 1,000-recipient campaign limit.");
 const campaignId=crypto.randomUUID(),plain=textFromHtml(html),origin=new URL(request.url).origin,now=new Date().toISOString();
 await env.DB.prepare("INSERT INTO newsletter_campaigns(id,subject,html_body,text_body,audience,created_by,recipient_count) VALUES(?,?,?,?,?,?,?)").bind(campaignId,subject,html,plain,district||"all",admin.id,recipients.length).run();
 let delivered=0;
 for(const user of recipients){
  const token=randomToken(32),tokenHash=await sha256(token);
  await env.DB.prepare("INSERT INTO newsletter_preferences(user_id,token_hash,unsubscribed_at) VALUES(?,?,NULL) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,updated_at=datetime('now')").bind(user.id,tokenHash).run();
  await env.DB.prepare("INSERT INTO newsletter_unsubscribe_tokens(token_hash,user_id) VALUES(?,?)").bind(tokenHash,user.id).run();
  const unsubscribe=origin+"/unsubscribe/"+token;
  const footer='<div class="newsletter-footer">You are receiving this EducationGames Mail newsletter. <a href="'+unsubscribe+'">Unsubscribe</a></div>';
  const full='<div class="newsletter-mail-shell">'+html+footer+'</div>';
  await env.DB.prepare("INSERT INTO messages(id,owner_id,direction,folder,from_address,to_addresses,cc_addresses,subject,text_body,html_body,message_id,is_read,sent_at,received_at) VALUES(?,?,'inbound','inbox',?,'[]','[]',?,?,?,?,0,?,?)").bind(crypto.randomUUID(),user.id,admin.email_alias,subject,plain+"\n\nUnsubscribe: "+unsubscribe,full,campaignId,now,now).run();
  delivered++;
 }
 return json({ok:true,campaign_id:campaignId,delivered},201);
}
export async function unsubscribeInfo(env:Env,token:string):Promise<Response>{
 const hash=await sha256(token),row=await env.DB.prepare("SELECT u.email_alias,p.unsubscribed_at FROM newsletter_unsubscribe_tokens t JOIN newsletter_preferences p ON p.user_id=t.user_id JOIN users u ON u.id=p.user_id WHERE t.token_hash=?").bind(hash).first<{email_alias:string;unsubscribed_at:string|null}>();
 if(!row)return error("This unsubscribe link is invalid or expired.",404);
 return json({email:row.email_alias,unsubscribed:!!row.unsubscribed_at});
}
export async function unsubscribe(request:Request,env:Env,token:string):Promise<Response>{
 const hash=await sha256(token),row=await env.DB.prepare("SELECT user_id FROM newsletter_unsubscribe_tokens WHERE token_hash=?").bind(hash).first<{user_id:string}>();
 if(!row)return error("This unsubscribe link is invalid or expired.",404);
 await env.DB.prepare("UPDATE newsletter_preferences SET unsubscribed_at=datetime('now'),updated_at=datetime('now') WHERE user_id=?").bind(row.user_id).run();
 return json({ok:true});
}
