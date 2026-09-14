import {request} from './client.js';
const [method='status',raw='{}']=process.argv.slice(2);
try {console.log(JSON.stringify(await request(method,JSON.parse(raw)),null,2));}catch(error){console.error(error.message);process.exitCode=1;}
