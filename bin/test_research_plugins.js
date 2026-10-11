"use strict";

const path = require("path");
const [runtime = path.resolve(__dirname,".."), wiki_path = path.resolve(__dirname,"../editions/tiddlyresearch-test")] = process.argv.slice(2);
const tw = require(path.resolve(runtime,"boot/boot.js")).TiddlyWiki();
tw.boot.argv = [wiki_path];
tw.boot.boot(() => {
	tw.modules.execute("$:/plugins/tiddlywiki/jasmine/jasmine-plugin.js").runTests(error => {
		if(error) console.error(error);
		process.exit(error ? 1 : 0);
	});
});
