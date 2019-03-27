import Ajv from "ajv";
import fs from "fs";
import { promisify as _p } from "util";
import path from "path";

const readFile = _p(fs.readFile);
const writeFile = _p(fs.writeFile);
const readdir = _p(fs.readdir);
const stat = _p(fs.stat);
const exists = _p(fs.exists);

const ajv = new Ajv();

let config: IObject<any> = {};

async function validate(schema: object): Promise<boolean> {
    try {
        await ajv.compileAsync(schema);
        return true;
    } catch (e) {
        return false;
    }
}

async function parseFile(file: string): Promise<IInterface[]> {
    let data = (await readFile(file)).toString();
    data = data.replace(/\t/g, " ").replace(/\r/g, "");
    const blocks: string[][] = [];
    let temp: string[] = [];
    let write = false;
    for (const line of data.split("\n")) {
        const d = line.trim();
        if (d === "/* SCHEMA */" && !write) {
            write = true;
        } else if (d === "/* END SCHEMA */" && write) {
            write = false;
            blocks.push(temp.slice(0));
            temp = [];
        } else if (write) {
            temp.push(line.trim());
        }
    }
    temp = [];
    const r: string[][] = [];
    for (const block of blocks) {
        for (const lines of block) {
            temp = temp.concat(lines.split(" "));
        }
        r.push(temp.slice(1));
        temp = [];
    }
    const res: IInterface[] = [];
    temp = [];
    for (const iline of r) {
        const name = iline[0];
        const inter: IInterface = {
            name,
            props: {},
            indices: [],
        };
        const idata = iline.slice(2, iline.length - 1);
        let state: ParseState = ParseState.None;
        let cname: string = "";
        let iobjname: string = "";
        let tempobjs: IInterface[] = [];
        for (const w of idata) {
            switch (state) {
                case ParseState.None:
                    cname = "";
                    if (w.endsWith(":")) {
                        // Must be either prop name or index signature.
                        cname = w.substring(0, w.length - 1);
                        if (cname === "[key") {
                            // Index Signature
                            state = ParseState.FoundIndex;
                        } else {
                            // Prop name
                            state = ParseState.FoundProp;
                        }
                    } else if ((w === "};" || w === "}") && iobjname !== "") {
                        const tempiobj = Object.assign({}, tempobjs.pop());
                        if (tempiobj !== undefined) {
                            if (tempobjs.length > 0) {
                                tempobjs[tempobjs.length - 1].props[tempiobj.name] = tempiobj;
                            } else {
                                inter.props[tempiobj.name] = tempiobj;
                                tempobjs = [];
                                iobjname = "";
                            }
                        }
                    }
                    break;
                case ParseState.FoundIndex:
                    const type = w.substring(0, w.length - 2);
                    temp.push(type);
                    state = ParseState.IndexValue;
                    break;
                case ParseState.IndexValue:
                    const value = w.substring(0, w.length - 1);
                    if (iobjname === "") {
                        inter.indices.push({
                            key: temp[0],
                            value,
                        });
                    } else if (tempobjs.length > 0) {
                        tempobjs[tempobjs.length - 1].indices.push({
                            key: temp[0],
                            value,
                        });
                    }
                    temp = [];
                    state = ParseState.None;
                    break;
                case ParseState.FoundProp:
                    if (w !== "{" && w.endsWith(";")) {
                        // Regular prop
                        if (iobjname === "") {
                            inter.props[cname] = w.substring(0, w.length - 1);
                        } else if (tempobjs.length > 0) {
                            tempobjs[tempobjs.length - 1].props[cname] = w.substring(0, w.length - 1);
                        }
                        state = ParseState.None;
                    } else if (w === "{") {
                        // Start object capture.
                        if (iobjname !== "" && tempobjs.length > 0) {
                            tempobjs.push({
                                name: cname,
                                props: {},
                                indices: [],
                            });
                        } else {
                            iobjname = cname;
                            tempobjs.push({
                                name: iobjname,
                                props: {},
                                indices: [],
                            });
                        }
                        state = ParseState.None;
                    }
                    break;
            }
        }
        res.push(inter);
    }
    return res;
}

interface IObject<T> {
    [key: string]: T;
}

interface IInterface {
    name: string;
    indices: IInterfaceIndex[];
    props: {
        [key: string]: string | IInterface;
    };
}

interface IInterfaceIndex {
    key: string;
    value: string | IInterface;
}

interface ISchema {
    $schema: "http://json-schema.org/draft-07/schema#";
    title: string;
    description?: string;
    $comment?: string;
    type: "object";
    properties: {
        [key: string]: any;
    };
    required: string[];
}

function schemaTemplate(name: string, description?: string): ISchema {
    return {
        $schema: "http://json-schema.org/draft-07/schema#",
        title: name,
        description,
        type: "object",
        properties: {},
        required: [],
    };
}

function getSchemaProps(inter: IInterface, schema: IObject<any>): Promise<void> {
    return new Promise(async (resolve, reject) => {
        if (inter.indices.length > 0) {
            schema.description = JSON.stringify({ indexSignatures: inter.indices });
        }
        for (const key of Object.keys(inter.props)) {
            const prop = inter.props[key];
            if (typeof prop === "string") {
                schema.properties[key] = {
                    description: "",
                    type: prop,
                };
            } else {
                schema.properties[key] = {
                    description: "",
                    type: "object",
                    properties: {},
                };
                await getSchemaProps(prop, schema.properties[key]);
            }
        }
        resolve();
    });
}

function toSchema(inter: IInterface): Promise<ISchema> {
    return new Promise(async (resolve, reject) => {
        const schema: ISchema = schemaTemplate(inter.name);
        if (inter.indices.length > 0) {
            schema.$comment = JSON.stringify({ indexSignatures: inter.indices });
        }
        for (const key of Object.keys(inter.props)) {
            const prop = inter.props[key];
            if (typeof prop === "string") {
                schema.properties[key] = {
                    description: "",
                    type: prop,
                };
            } else {
                schema.properties[key] = {
                    description: "",
                    type: "object",
                    properties: {},
                };
                await getSchemaProps(prop, schema.properties[key]);
            }
        }
        schema.required = Object.keys(inter.props);
        resolve(schema);
    });
}

enum ParseState {
    None,
    FoundIndex,
    IndexValue,
    FoundProp,
    FoundObject,
    InnerObject,
}

function readRoot(rootDir: string, list?: string[]): Promise<string[]> {
    const clist: string[] = list || [];
    return new Promise(async (resolve, reject) => {
        const files = await readdir(rootDir);
        for (const file of files) {
            const filePath = path.join(rootDir, file);
            const fstat = await stat(filePath);
            if (fstat.isDirectory()) {
                await readRoot(filePath, clist);
            } else if (path.parse(filePath).ext === ".ts") {
                clist.push(filePath);
            }
        }
        resolve(clist);
    });
}

(async () => {
    const init = process.argv.findIndex((e) => e === "--init");
    let root: string = process.argv[2] || process.cwd();
    if (init !== -1) {
        if (init === 2) {
            root = process.argv[3] || process.cwd();
        }
        const confpath = path.join(root, "ischema.json");
        await writeFile(confpath, JSON.stringify({
            options: {
                rootDir: ".",
                outDir: "./schemas",
            },
        }, null, "\t"));
    } else {
        const confpath = path.join(root, "ischema.json");
        if (await exists(confpath)) {
            // Load config.
            config = JSON.parse((await readFile(confpath)).toString());
        } else {
            config.options = {};
            config.options.rootDir = ".";
            config.options.outDir = ".";
        }
        if (!path.isAbsolute(config.options.rootDir)) {
            config.options.rootDir = path.join(root, config.options.rootDir);
        }
        if (!path.isAbsolute(config.options.outDir)) {
            config.options.outDir = path.join(root, config.options.outDir);
        }
        if (!(await exists(config.options.outDir))) {
            fs.mkdirSync(config.options.outDir);
        }
        const files = await readRoot(config.options.rootDir);
        for (const file of files) {
            const res = await parseFile(file);
            for (const inter of res) {
                const schema = await toSchema(inter);
                if (validate(schema)) {
                    await writeFile(path.join(config.options.outDir, schema.title + ".json"),
                    JSON.stringify(schema, null, "\t"));
                } else {
                    throw new Error("Invalid schema: " + schema.title);
                }
            }
        }
    }
})();
