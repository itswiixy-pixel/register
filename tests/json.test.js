import assert from "node:assert/strict";
import test from "node:test";
import fs from "fs-extra";
import path from "path";

import internalDomains from "../util/internal.json" with { type: "json" };
import reservedDomains from "../util/reserved.json" with { type: "json" };

const ignoredRootJSONFiles = ["package-lock.json", "package.json"];

const requiredFields = {
    owner: "object",
    records: "object"
};

const optionalFields = {
    proxied: "boolean",
    redirect_config: "object"
};

const requiredOwnerFields = {
    username: "string"
};

const optionalOwnerFields = {
    email: "string"
};

const optionalRedirectConfigFields = {
    custom_paths: "object",
    redirect_paths: "boolean"
};

const blockedFields = ["domain", "internal", "proxy", "reserved", "services", "subdomain", "subdomains", "nested", "record"];

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const hostnameRegex = /^(?=.{1,253}$)(?:(?:[_a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)\.)+[a-zA-Z]{2,63}$/;

const domainsPath = path.resolve("domains");
const files = fs.readdirSync(domainsPath);

function findDuplicateKeys(jsonString) {
    const duplicateKeys = new Set();
    const keyStack = [];

    const keyRegex = /"(.*?)"\s*:/g;

    let i = 0;
    while (i < jsonString.length) {
        const char = jsonString[i];

        if (char === "{") {
            keyStack.push({});
            i++;
            continue;
        }

        if (char === "}") {
            keyStack.pop();
            i++;
            continue;
        }

        keyRegex.lastIndex = i;
        const match = keyRegex.exec(jsonString);
        if (match && match.index === i && keyStack.length > 0) {
            const key = match[1];
            const currentScope = keyStack[keyStack.length - 1];

            if (currentScope[key]) {
                duplicateKeys.add(key);
            } else {
                currentScope[key] = true;
            }

            i = keyRegex.lastIndex;
        } else {
            i++;
        }
    }

    return [...duplicateKeys];
}

function validateFields(obj, fields, file, prefix = "") {
    for (const key of Object.keys(fields)) {
        const fieldPath = prefix ? `${prefix}.${key}` : key;

        if (obj.hasOwnProperty(key)) {
            assert.equal(typeof obj[key], fields[key], `${file}: Field ${fieldPath} should be of type ${fields[key]}`);
        } else if (fields === requiredFields || fields === requiredOwnerFields) {
            assert.equal(false, true, `${file}: Missing required field: ${fieldPath}`);
        }
    }
}

function validateFileName(file) {
    assert.equal(file.endsWith(".json"), true, `${file}: File does not have .json extension`);
    assert.equal(file.includes(".is-a.dev"), false, `${file}: File name should not contain .is-a.dev`);
    assert.equal(file === file.toLowerCase(), true, `${file}: File name should be all lowercase`);
    assert.equal(file.includes("--"), false, `${file}: File name should not contain consecutive hyphens`);

    const subdomain = file.replace(/\.json$/, "");

    assert.match(
        subdomain + ".is-a.dev",
        hostnameRegex,
        `${file}: FQDN must be 1-253 characters, can use letters, numbers, dots, and non-consecutive hyphens.`
    );
    assert.equal(internalDomains.includes(subdomain), false, `${file}: Subdomain name is registered internally`);
    assert.equal(reservedDomains.includes(subdomain), false, `${file}: Subdomain name is reserved`);
    assert.equal(
        !internalDomains.some((i) => subdomain.endsWith(`.${i}`)), true,
        `${file}: Subdomain name is registered internally`
    );
    assert.equal(!reservedDomains.some((r) => subdomain.endsWith(`.${r}`)), true, `${file}: Subdomain name is reserved`);

    const rootSubdomain = subdomain.split(".").pop();
    assert.equal(rootSubdomain.startsWith("_"), false, `${file}: Root subdomains should not start with an underscore`);
    assert.equal(rootSubdomain.includes("is-a-dev"), false, `${file}: Root subdomains should not contain is-a-dev`);
}

function processFile(file) {
    const filePath = path.join(domainsPath, file);
    const rawData = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(rawData.replace(/^\uFEFF/, ""));

    validateFileName(file);

    // Check for duplicate keys
    const duplicateKeys = findDuplicateKeys(rawData);
    assert.equal(!duplicateKeys.length, true, `${file}: Duplicate keys found: ${duplicateKeys.join(", ")}`);

    // Validate fields
    validateFields(data, requiredFields, file);
    validateFields(data.owner, requiredOwnerFields, file, "owner");
    validateFields(data.owner, optionalOwnerFields, file, "owner");
    validateFields(data, optionalFields, file);

    if (data.owner.email) {
        assert.match(data.owner.email, emailRegex, `${file}: Owner email should be a valid email address`);
        assert.equal(
            data.owner.email.endsWith("@users.noreply.github.com"), false,
            `${file}: Owner email should not be a GitHub no-reply email`
        );
    }

    assert.equal(Object.keys(data.records).length > 0, true, `${file}: Missing DNS records`);

    if (data.redirect_config) {
        validateFields(data.redirect_config, optionalRedirectConfigFields, file, "redirect_config");
    }

    for (const field of blockedFields) {
        assert.equal(!data.hasOwnProperty(field), true, `${file}: Disallowed field: ${field}`);
    }
}

test("JSON files should not be in the root directory", () => {
    const rootFiles = fs
        .readdirSync(path.resolve())
        .filter((file) => file.endsWith(".json") && !ignoredRootJSONFiles.includes(file));
    assert.equal(rootFiles.length, 0, "JSON files should not be in the root directory");
});

test("All files should be valid JSON", () => {
    for (const file of files) {
        assert.doesNotThrow(() => fs.readJsonSync(path.join(domainsPath, file)), `${file}: Invalid JSON file`);
    }
});

test("All files should have valid file names", () => {
    for (const file of files) validateFileName(file);
});

test("All files should have valid required and optional fields", () => {
    for (const file of files) processFile(file);
});
