import assert from "node:assert/strict";
import test from "node:test";
import fs from "fs-extra";
import path from "path";

const requiredRecordsToProxy = new Set(["A", "AAAA", "CNAME"]);

const domainCache = {};

function getDomainData(file) {
    if (domainCache[file]) {
        return domainCache[file];
    }

    try {
        const data = fs.readJsonSync(path.join(domainsPath, file));
        domainCache[file] = data;
        return data;
    } catch (error) {
        throw new Error(`Failed to read JSON for ${file}: ${error.message}`);
    }
}

function validateProxiedRecords(data, file) {
    const recordTypes = Array.from(requiredRecordsToProxy).join(", ");

    // Forcefully stop raw.is-a.dev from being proxied
    if (file === "raw.json") {
        assert.equal(!data.proxied, true, `${file}: raw.is-a.dev cannot be proxied`);
        return;
    }

    if (data.proxied) {
        const hasProxiedRecord = Object.keys(data.records).some((key) => requiredRecordsToProxy.has(key));

        assert.equal(
            hasProxiedRecord, true,
            `${file}: Proxied is true but there are no records that can be proxied (${recordTypes} expected)`
        );
    }
}

const domainsPath = path.resolve("domains");
const files = fs.readdirSync(domainsPath).filter((file) => file.endsWith(".json"));

test("Domains with proxy enabled must have at least one proxy-able record", () => {
    files.forEach((file) => {
        const data = getDomainData(file);

        validateProxiedRecords(data, file);
    });
});

const unproxyable = [
    {
        type: "CNAME",
        value: "*.onrender.com"
    }
];

test("Domains with specific records must not have proxy enabled", () => {
    files.forEach((file) => {
        const data = getDomainData(file);

        if (data.proxied) {
            unproxyable.forEach((record) => {
                let recordExists = false;

                if (!data.records[record.type]) {
                    return;
                } else if (Array.isArray(data.records[record.type])) {
                    recordExists = data.records[record.type].some((r) =>
                        record.value.startsWith("*.") ? r.endsWith(record.value.slice(2)) : r === record.value
                    );
                } else {
                    recordExists = record.value.startsWith("*.")
                        ? data.records[record.type].endsWith(record.value.slice(2))
                        : data.records[record.type] === record.value;
                }

                assert.equal(
                    recordExists, false,
                    `${file}: Records matching \`${record.type}: "${record.value}"\` cannot be proxied`
                );
            });
        }
    });
});
