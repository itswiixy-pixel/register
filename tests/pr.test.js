import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";

function readTreeJson(ref, filename) {
    const text = execFileSync("git", ["show", `${ref}:${filename}`], { encoding: "utf8" });
    return JSON.parse(text.replace(/^\uFEFF/, ""));
}

test("Users can only update their own subdomains", () => {
    const { PR_BASE: base, PR_AUTHOR: login, PR_AUTHOR_ID: authorId, PR_LABELS: labels } = process.env;
    if (!base && !login && !authorId) return;
    if (!base || !login || !authorId) return assert.fail("Missing pull request metadata");
    if (JSON.parse(labels ?? "[]").includes("ci: bypass-owner-check")) return;

    const author = login.toLowerCase();
    const trustedUser = readTreeJson(base, "util/trusted.json").find((user) => String(user.id) === authorId);
    const changes = execFileSync("git", ["diff", "--name-status", "--no-renames", "-z", base, "HEAD", "--", "domains/"], {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024
    }).split("\0");

    const checkOwner = (ref, filename) => {
        const owner = readTreeJson(ref, filename).owner.username.toLowerCase();
        const allowed = owner === "is-a-dev" ? Boolean(trustedUser?.admin) : owner === author || Boolean(trustedUser);
        assert.equal(allowed, true, `${filename}: ${author} is not authorized to change this subdomain`);
    };

    for (let i = 0; i + 1 < changes.length; i += 2) {
        const status = changes[i];
        const filename = changes[i + 1];
        if (!filename.endsWith(".json")) continue;
        if (status !== "A") checkOwner(base, filename);
        if (status !== "D") checkOwner("HEAD", filename);
    }
});
