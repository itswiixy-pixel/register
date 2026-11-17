import fs from "fs";
import path from "path";

import internal from "./internal.json" with { type: "json" };
import reserved from "./reserved.json" with { type: "json" };

const directoryPath = "./domains";
const outputDir = "./raw-api";
const domainsOutputDir = path.join(outputDir, "v2", "domains");

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}
if (!fs.existsSync(domainsOutputDir)) {
    fs.mkdirSync(domainsOutputDir, { recursive: true });
}

function writeDomainFile(entry) {
    fs.writeFileSync(
        path.join(domainsOutputDir, `${entry.subdomain}.json`),
        JSON.stringify(entry)
    );
}

const v2 = [];

for (const subdomain of internal) {
    const entry = {
        domain: `${subdomain}.is-a.dev`,
        subdomain: subdomain,
        owner: { username: "is-a-dev" },
        records: { CNAME: "internal.is-a.dev" },
        internal: true
    };
    v2.push(entry);
    writeDomainFile(entry);
}

for (const subdomain of reserved) {
    const entry = {
        domain: `${subdomain}.is-a.dev`,
        subdomain: subdomain,
        owner: { username: "is-a-dev" },
        records: { URL: "https://is-a.dev/reserved" },
        reserved: true
    };
    v2.push(entry);
    writeDomainFile(entry);
}

for (const file of fs.readdirSync(directoryPath)) {
    const data = fs.readFileSync(path.join(directoryPath, file), "utf8");
    const item = JSON.parse(data.replace(/^\uFEFF/, ""));
    const subdomain = path.parse(file).name;
    delete item.owner.email;

    const entry = {
        domain: `${subdomain}.is-a.dev`,
        subdomain,
        owner: item.owner,
        records: item.records
    };
    if (item.redirect_config) entry.redirect_config = item.redirect_config;
    if (item.proxied) entry.proxied = item.proxied;

    v2.push(entry);
    writeDomainFile(entry);
}

v2.sort((a, b) => a.domain.localeCompare(b.domain));
fs.writeFileSync(path.join(outputDir, "v2.json"), JSON.stringify(v2));
