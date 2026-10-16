import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const assets={'/':['index.html','text/html'],'/index.html':['index.html','text/html'],'/styles.css':['styles.css','text/css'],'/app.js':['app.js','text/javascript'],'/domain.js':['domain.js','text/javascript']};
const server=http.createServer(async(req,res)=>{const item=assets[new URL(req.url,'http://localhost').pathname];if(!item){res.writeHead(404);res.end('Not found');return;}try{const body=await readFile(fileURLToPath(new URL(item[0],import.meta.url)));res.writeHead(200,{'Content-Type':item[1]+'; charset=utf-8','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(500);res.end('Could not load prototype');}});
server.listen(4173,'127.0.0.1',()=>console.log('Incident Desk is ready: http://localhost:4173'));
