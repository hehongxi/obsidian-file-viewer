import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	// Obsidian plugin recommended rules
	...obsidianmd.configs.recommended,

	// TypeScript files
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				project: "./tsconfig.json",
				sourceType: "module",
			},
		},
		rules: {
			// Existing project rules
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
			"@typescript-eslint/ban-ts-comment": "off",
			"no-prototype-builtins": "off",
			"@typescript-eslint/no-empty-function": "off",

			// Suppress strict type-safety rules from @typescript-eslint v8
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-unsafe-argument": "off",

			// Suppress prefer-active-doc warnings (popout-window compat)
			"obsidianmd/prefer-active-doc": "off",

			// Suppress innerHTML rules (plugin uses DOMPurify for sanitization)
			"no-unsanitized/property": "off",
			"@microsoft/sdl/no-inner-html": "off",

			// Suppress file-manager-trash preference
			"obsidianmd/prefer-file-manager-trash-file": "off",

			// Suppress no-static-styles-assignment (extensive DOM refactor needed)
			"obsidianmd/no-static-styles-assignment": "off",

			// Suppress console logging rule (legacy debug code)
			"obsidianmd/rule-custom-message": "off",
		},
	},

	// JS/MJS files (esbuild config etc.)
	{
		files: ["**/*.js", "**/*.mjs"],
	},
]);
