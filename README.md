# ischema

A TypeScript interface parser for generating JSON schemas.

## Usage
Install for CLI: `yarn global add ischema` | `npm i ischema -g`
Run: `ischema` for current directory, or `ischema path/to/directory/`

## Options
Create an `ischema.json` file in the root you will be searching.
```js
{
	"options": {
		"rootDir": ".",
		"outDir": "./schemas"
	}
}
```