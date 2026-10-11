/*\
title: $:/tiddlyresearch/tests/stream_relationships.js
type: application/javascript
tags: $:/tags/test-spec
\*/
(function(){
"use strict";

describe("Streams relationship changes",function() {
	var wiki,root;
	function actions(name,title,extra) {
		root.invokeActionString("\\import [[$:/plugins/sq/streams/action-macros]]\n<<" + name + ">>",root,{event:{view:{confirm:function() {return true;}}}},Object.assign({
			currentTiddler:title,"stream-root-title":"Root","row-edit-state":"$:/test/edit",selectionEnd:"0"
		},extra));
	}
	function save_draft_scenario(title,protection,change) {
		wiki.setText("$:/config/sq/streams/enable_edit_mode","text",null,protection);
		var widget = wiki.makeWidget(wiki.parseText("text/vnd.tiddlywiki","<$navigator/>"),{document:$tw.fakeDocument});
		widget.render($tw.fakeDocument.createElement("div"),null);
		function find_navigator(node) {
			return node.parseTreeNode.type === "navigator" ? node : node.children.map(find_navigator).find(Boolean);
		}
		var navigator = find_navigator(widget), draft = navigator.makeDraftTiddler(title), original_wiki = $tw.wiki;
		change();
		// Startup hooks use the active wiki, as they do in the browser.
		try {
			$tw.wiki = wiki;
			navigator.handleSaveTiddlerEvent({param:draft.fields.title,paramObject:{suppressNavigation:"yes"},event:{view:{}}});
		} finally {
			$tw.wiki = original_wiki;
		}
	}
	beforeEach(function() {
		wiki = new $tw.Wiki();
		wiki.addTiddlers($tw.wiki.filterTiddlers("[all[shadows+tiddlers]is[system]]").map(function(title) {return $tw.wiki.getTiddler(title);}));
		wiki.addTiddlers([
			{title:"Root",text:"Root","stream-type":"default","stream-list":"A B"},
			{title:"A",text:"First",parent:"Root","stream-type":"default"},
			{title:"B",text:"Second",parent:"Root","stream-type":"default","stream-list":"C"},
			{title:"C",text:"Child",parent:"B","stream-type":"default"},
			{title:"$:/config/sq/streams/prompt-merge-with-previous",text:"no"}
		]);
		root = wiki.makeWidget(wiki.parseText("text/vnd.tiddlywiki",""),{document:$tw.fakeDocument});
		root.render($tw.fakeDocument.createElement("div"),null);
	});
	it("updates both directions when indenting and un-indenting",function() {
		actions("indent-node-actions","B");
		expect(wiki.getTiddler("B").fields.parent).toBe("A");
		expect(wiki.getTiddlerList("A","stream-list")).toEqual(["B"]);
		expect(wiki.getTiddlerList("Root","stream-list")).toEqual(["A"]);
		actions("unindent-node-actions","B");
		expect(wiki.getTiddler("B").fields.parent).toBe("Root");
		expect(wiki.getTiddlerList("Root","stream-list")).toEqual(["A","B"]);
	});
	it("retargets children before removing a merged node",function() {
		actions("merge-with-previous-node-actions","B");
		expect(wiki.tiddlerExists("B")).toBe(false);
		expect(wiki.getTiddler("A").fields.text).toBe("FirstSecond");
		expect(wiki.getTiddlerList("A","stream-list")).toEqual(["C"]);
		expect(wiki.getTiddler("C").fields.parent).toBe("A");
	});
	it("removes a cancelled blank node from its owner as well as the wiki",function() {
		wiki.setText("A","text",null,"");
		actions("cancel-edit-node-actions","A");
		expect(wiki.tiddlerExists("A")).toBe(false);
		expect(wiki.getTiddlerList("Root","stream-list")).toEqual(["B"]);
	});

	["no","yes"].forEach(function(protection) {
		it("demonstrates saved draft move handling with protection " + protection,function() {
			save_draft_scenario("B",protection,function() {actions("indent-node-actions","B");});
			expect(wiki.getTiddlerList("A","stream-list")).toEqual(["B"]);
			expect(wiki.getTiddler("B").fields.parent).toBe(protection === "yes" ? "A" : "Root");
		});
		it("demonstrates saved draft child removal handling with protection " + protection,function() {
			wiki.setText("A","text",null,"");
			save_draft_scenario("Root",protection,function() {actions("cancel-edit-node-actions","A");});
			expect(wiki.tiddlerExists("A")).toBe(false);
			expect(wiki.getTiddlerList("Root","stream-list")).toEqual(protection === "yes" ? ["B"] : ["A","B"]);
		});
		it("demonstrates saved draft child creation handling with protection " + protection,function() {
			wiki.setText("$:/config/sq/streams/new-node-title","text",null,"New child");
			save_draft_scenario("Root",protection,function() {actions("add-new-node-actions","Root");});
			expect(wiki.getTiddler("New child").fields.parent).toBe("Root");
			expect(wiki.getTiddlerList("Root","stream-list")).toEqual(protection === "yes" ? ["A","B","New child"] : ["A","B"]);
		});
	});
});
})();
