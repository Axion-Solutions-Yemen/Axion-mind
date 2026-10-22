const fs=require('node:fs'),path=require('node:path');
module.exports=function uiSource(){const ui=path.join(__dirname,'../ui');return fs.readFileSync(path.join(ui,'index.html'),'utf8')+'\n'+fs.readFileSync(path.join(ui,'chat-app.js'),'utf8');};
