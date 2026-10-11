/*\
title: $:/tiddlyresearch/tests/swiper.js
type: application/javascript
tags: $:/tags/test-spec

\*/
(function(){

"use strict";

describe("TiddlyResearch static rendering",function() {
	it("renders swipe widget content without browser event APIs",function() {
		var wiki = new $tw.Wiki();
		wiki.addTiddler({
			title: "Swipe content",
			text: '<$swiper tag="section">Exported content</$swiper>'
		});
		expect(wiki.renderTiddler("text/html","Swipe content",{parseAsInline: true}))
			.toBe("<section>Exported content</section>");
	});
});

})();
