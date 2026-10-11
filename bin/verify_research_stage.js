"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const [runtime,wiki_path] = process.argv.slice(2);
const tw = require(path.resolve(runtime,"boot/boot.js")).TiddlyWiki();
tw.boot.argv = [path.resolve(wiki_path)];
tw.boot.boot(() => {
	const wiki = tw.wiki;
	const original = JSON.parse(fs.readFileSync(path.join(wiki_path,"migration/source.json")));
	const manifest = JSON.parse(fs.readFileSync(path.join(wiki_path,"migration/manifest.json")));
	const entries = new Map(manifest.entries.map(entry => [entry.title,entry]));
	const presentation_fields = new Set(["$:/SiteTitle","$:/SiteSubtitle","$:/DefaultTiddlers","$:/StoryList"]);
	// The snapshot's Today startup action deliberately refreshes this date.
	const startup_fields = new Map([["Today",new Set(["event.date","modified"])]]);
	const active_tags = new Set(["$:/tags/ViewTemplate","$:/tags/Stylesheet","$:/tags/Macro"]);
	let checked = 0;
	for(const source of original) {
		const entry = entries.get(source.title);
		if(entry && entry.action === "delete") {
			assert(!wiki.tiddlerExists(source.title),"Saved override still present: " + source.title);
			continue;
		}
		if(presentation_fields.has(source.title)) continue;
		const current = wiki.getTiddler(source.title);
		assert(current,"Missing original tiddler: " + source.title);
		if(entry && entry.action === "retire") {
			const expected_tags = tw.utils.parseStringArray(source.tags || "").filter(tag => !active_tags.has(tag));
			assert.deepStrictEqual(current.fields.tags || [],expected_tags,"Retired template tags changed unexpectedly: " + source.title);
		}
		for(const field of Object.keys(source)) {
			if(entry && entry.action === "retire" && field === "tags") continue;
			if((startup_fields.get(source.title) || new Set()).has(field)) continue;
			assert.strictEqual(current.getFieldString(field),new tw.Tiddler(source).getFieldString(field),source.title + " field changed: " + field);
		}
		checked++;
	}
	assert.strictEqual(wiki.getTiddler("$:/plugins/sq/streams").fields.version,"1.3.1");
	assert.strictEqual(wiki.getTiddler("$:/plugins/xiubo/research").fields.version,"1.0.0");
	assert.strictEqual(wiki.getShadowSource("$:/core/ui/EditTemplate/body"),"$:/core");
	assert.strictEqual(wiki.getShadowSource("$:/plugins/sq/streams/templates/stream-row-template"),"$:/plugins/sq/streams");
	assert.strictEqual(wiki.getShadowSource("$:/config/sq/streams/breadcrumb_template"),"$:/plugins/xiubo/research");
	console.log(JSON.stringify({core:tw.version,original_tiddlers_verified:checked,migrated_customizations:entries.size,streams:"1.3.1",research:"1.0.0"}));
	process.exit(0);
});
