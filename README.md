# ischema

A TypeScript interface parser for generating JSON schemas.

## Usage
Install for CLI: `yarn global add ischema` | `npm i ischema -g`
Run: `ischema` for current directory, or `ischema path/to/directory/`

Mark interfaces for transpilation by wrapping them with: `/* SCHEMA */` and `/* END SCHEMA */`.

Example:

```ts
/* SCHEMA */
interface ITest {
	[key: string]: any;
}
/* END SCHEMA */
```

## Options
Create an `ischema.json` file in the root you will be running ischema in.
```js
{
	"options": {
		"rootDir": ".",
		"outDir": "./schemas"
	}
}
```

Use `ischema --init` or `ischema --init path/to/folder` to create this file for you.

## Known Issues

- Issues parsing function types properly.
- Does not conform types to JSON strict types (yet).