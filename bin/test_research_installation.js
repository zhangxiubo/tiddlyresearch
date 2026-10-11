"use strict";

const assert = require("node:assert/strict");
const {spawn,execFileSync} = require("node:child_process");
const {once} = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {setTimeout: delay} = require("node:timers/promises");
const test = require("node:test");
const project = path.resolve(__dirname,"..");
const cli = path.join(project,"tiddlywiki.js");

function run_cli(...args) {
	return execFileSync(process.execPath,[cli,...args],{cwd:project,encoding:"utf8",timeout:120000,maxBuffer:20 * 1024 * 1024});
}

async function stop_server(child) {
	if(child.exitCode !== null || child.signalCode !== null) return;
	const exited = once(child,"exit");
	child.kill("SIGTERM");
	await exited;
}

function start_server(wiki,context) {
	const child = spawn(process.execPath,[cli,wiki,"--listen","host=127.0.0.1","port=0"],{cwd:project,stdio:["ignore","pipe","pipe"]});
	context.after(() => stop_server(child));
	return new Promise((resolve,reject) => {
		let output = "";
		const timeout = setTimeout(() => {child.kill(); reject(new Error("Server did not start: " + output));},30000);
		const failed = error => {clearTimeout(timeout); reject(error);};
		child.once("error",failed);
		child.once("exit",code => failed(new Error("Server exited with code " + code + ": " + output)));
		function read(chunk) {
			output += chunk.toString();
			const match = output.match(/Serving on (http:\/\/127\.0\.0\.1:\d+)/);
			if(match) {
				clearTimeout(timeout);
				const [,url] = match;
				resolve({child,url});
			}
		}
		child.stdout.on("data",read);
		child.stderr.on("data",read);
	});
}

async function request_tiddler(server,title,fields) {
	const response = await fetch(server.url + "/recipes/default/tiddlers/" + encodeURIComponent(title),{
		method:fields ? "PUT" : "GET",
		headers:{"Content-Type":"application/json","X-Requested-With":"TiddlyWiki"},
		body:fields ? JSON.stringify({...fields,title}) : undefined,
		signal:AbortSignal.timeout(15000)
	});
	assert.equal(response.status,fields ? 204 : 200,"Tiddler request failed: " + title);
	return fields ? undefined : response.json();
}

async function wait_for_save(wiki,text) {
	const deadline = Date.now() + 15000;
	const directory = path.join(wiki,"tiddlers");
	while(Date.now() < deadline) {
		const saved = fs.readdirSync(directory).filter(name => name.endsWith(".tid"))
			.some(name => fs.readFileSync(path.join(directory,name),"utf8").includes(text));
		if(saved) return;
		await delay(100);
	}
	assert.fail("The filesystem adaptor did not persist the edited text");
}

test("fresh research installation loads dependencies, persists edits and exports notes",{timeout:180000},async context => {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(),"tiddlyresearch-installation-"));
	const wiki = path.join(temporary,"wiki"), exported = path.join(temporary,"export");
	// Register directory cleanup after the server cleanup hooks have completed.
	try {
		run_cli(wiki,"--init","tiddlyresearch");
		let server = await start_server(wiki,context);
		try {
			const response = await fetch(server.url,{signal:AbortSignal.timeout(30000)});
			assert.equal(response.status,200);
			assert.match(await response.text(),/\$:\/plugins\/xiubo\/research/);
			const versions = {
				"$:/core":"5.4.1","$:/plugins/sq/streams":"1.3.2","$:/plugins/xiubo/research":"1.0.1",
				"$:/plugins/flibbles/relink":"2.6.1","$:/plugins/flibbles/relink-titles":"2.6.0",
				"$:/plugins/flibbles/uglify":"1.11.1","$:/plugins/kixam/moment":"2.30.1",
				"$:/plugins/wikilabs/uni-link":"3.0.4"
			};
			for(const [title,version] of Object.entries(versions)) {
				assert.equal((await request_tiddler(server,title)).fields.version,version,"Unexpected dependency: " + title);
			}
			await request_tiddler(server,"Installation root",{text:"A research outline","stream-list":"[[Installation child]]","stream-type":"default"});
			await request_tiddler(server,"Installation child",{text:"Initial text",parent:"Installation root","stream-type":"default"});
			const edited_text = "Edited text survives a server restart and an offline export.";
			await request_tiddler(server,"Installation child",{text:edited_text,parent:"Installation root","stream-type":"default"});
			await wait_for_save(wiki,edited_text);
			await stop_server(server.child);
			server = await start_server(wiki,context);
			const saved = await request_tiddler(server,"Installation child");
			assert.equal(saved.text,edited_text);
			assert.equal(saved.fields.parent,"Installation root");
			assert.equal((await request_tiddler(server,"Installation root")).fields["stream-list"],"[[Installation child]]");
			await stop_server(server.child);
			run_cli(wiki,"--output",exported,"--build","index","static");
			assert(fs.readFileSync(path.join(exported,"alltiddlers.html"),"utf8").includes(edited_text));
			const reloaded = path.join(temporary,"reloaded");
			run_cli(path.join(temporary,"empty"),"--load",path.join(exported,"index.html"),"--savetiddlers","[[Installation child]]",reloaded);
			assert.equal(fs.readFileSync(path.join(reloaded,"Installation%20child"),"utf8"),edited_text);
		} finally {
			await stop_server(server.child);
		}
	} finally {
		fs.rmSync(temporary,{recursive:true,force:true});
	}
});
