// @aws-sdk/client-s3's XML (de)serializer imports @aws-sdk/xml-builder's
// "xml-parser", which that package's own package.json remaps to
// xml-parser.browser.js (via its "browser" field) whenever the bundler
// resolves it — including Wrangler's esbuild pass, regardless of the
// nodejs_compat compatibility flag, which only affects Node built-in
// polyfills at runtime, not this build-time package.json field resolution.
// That browser build calls `new DOMParser()` and references the bare
// global `Node.TEXT_NODE` / `Node.ELEMENT_NODE`, neither of which workerd
// provides, so every R2/S3 call whose response needs XML parsing (e.g.
// s3-service.js's background-image delete/replace) throws
// "DOMParser is not defined" at runtime.
//
// linkedom is already a project dependency and its DOMParser produces a
// real XMLDocument for any non-HTML/SVG mime type (see its parser.js),
// which is exactly what the AWS SDK's browser XML parser needs — so
// polyfilling with it, rather than patching or vendoring the dependency,
// keeps this fix contained to one file. Import this before anything that
// might touch the S3 client.
import { DOMParser } from 'linkedom';

if (typeof globalThis.DOMParser === 'undefined') {
	globalThis.DOMParser = DOMParser;
}

if (typeof globalThis.Node === 'undefined') {
	// Only the standard numeric node-type constants are read by the AWS SDK's
	// XML walker (`node.nodeType === Node.TEXT_NODE` / `Node.ELEMENT_NODE`);
	// these values are fixed by the DOM spec. This has to be an actual class,
	// not a plain object: something else in the dependency graph (observed
	// via `TypeError: Right-hand side of 'instanceof' is not callable` in
	// mail-sync-regression/scheduled-email/search specs once this ran) does
	// `x instanceof Node` against the same global, which requires the
	// right-hand side to be callable — a plain object isn't.
	globalThis.Node = class Node {
		static ELEMENT_NODE = 1;
		static ATTRIBUTE_NODE = 2;
		static TEXT_NODE = 3;
		static CDATA_SECTION_NODE = 4;
		static COMMENT_NODE = 8;
		static DOCUMENT_NODE = 9;
		static DOCUMENT_TYPE_NODE = 10;
		static DOCUMENT_FRAGMENT_NODE = 11;
	};
}
