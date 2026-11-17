import assert from "node:assert/strict";
import test from "node:test";
import fs from "fs-extra";
import path from "path";

const domainsPath = path.resolve("domains");
const files = fs.readdirSync(domainsPath).filter((file) => file.endsWith(".json"));

const domainCache = {};

function getDomainData(subdomain) {
    if (domainCache[subdomain]) {
        return domainCache[subdomain];
    }

    try {
        const data = fs.readJsonSync(path.join(domainsPath, `${subdomain}.json`));
        domainCache[subdomain] = data; // Cache the domain data
        return data;
    } catch (error) {
        throw new Error(`Failed to read JSON for ${subdomain}: ${error.message}`);
    }
}

test("Nested subdomains should not exist without a parent subdomain", () => {
    files.forEach((file) => {
        const subdomain = file.replace(/\.json$/, "");
        const parts = subdomain.split(".");

        for (let i = 1; i < parts.length; i++) {
            const parent = parts.slice(i).join(".");
            if (parent.startsWith("_")) continue;

            assert.equal(files.includes(`${parent}.json`), true, `${file}: Parent subdomain "${parent}" does not exist`);
        }
    });
});

test("Nested subdomains should not exist if any parent subdomain has NS records", () => {
    files.forEach((file) => {
        const subdomain = file.replace(/\.json$/, "");
        const parts = subdomain.split(".");

        for (let i = 1; i < parts.length; i++) {
            const parent = parts.slice(i).join(".");
            if (parent.startsWith("_") || !files.includes(`${parent}.json`)) continue;
            const parentData = getDomainData(parent);

            assert.equal(!parentData.records.NS, true, `${file}: Parent subdomain "${parent}" has NS records`);
        }
    });
});

test("Nested subdomains should be owned by the parent subdomain's owner", () => {
    files.forEach((file) => {
        const subdomain = file.replace(/\.json$/, "");
        const parentDomain = subdomain.split(".").reverse()[0];

        if (parentDomain !== subdomain) {
            const data = getDomainData(subdomain);
            const parentData = getDomainData(parentDomain);

            assert.equal(
                data.owner.username.toLowerCase() === parentData.owner.username.toLowerCase(), true,
                `${file}: Owner does not match the parent subdomain`
            );
        }
    });
});

test("Users are limited to one single character subdomain", () => {
    const results = [];

    files.forEach((file) => {
        const subdomain = file.replace(/\.json$/, "");
        const data = getDomainData(subdomain);

        if (subdomain.length === 1 && data.owner.username.toLowerCase() !== "is-a-dev") {
            results.push({
                subdomain,
                owner: data.owner.username.toLowerCase()
            });
        }
    });

    const duplicates = results.filter((result) => results.filter((r) => r.owner === result.owner).length > 1);
    const output = duplicates.reduce((acc, curr) => {
        if (!acc[curr.owner]) {
            acc[curr.owner] = [];
        }

        acc[curr.owner].push(`${curr.subdomain}.is-a.dev`);
        return acc;
    }, {});

    assert.equal(
        duplicates.length,
        0,
        Object.keys(output)
            .map((owner) => `${owner} - ${output[owner].join(", ")}`)
            .join("\n")
    );

});
