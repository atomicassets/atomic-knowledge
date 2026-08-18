# Repository settings

These are settings an administrator applies, not files a pull request changes. This document records the target state so a drifted setting is visible as a difference against it.

## About

Description:

> Validated, source-cited knowledge for AtomicAssets and AtomicMarket on WAX and other Antelope chains. Rendered at docs.atomicassets.io.

Homepage: `https://docs.atomicassets.io`

Topics: `atomicassets`, `atomicmarket`, `atomictools`, `wax`, `antelope`, `eosio`, `smart-contracts`, `blockchain`, `documentation`, `knowledge-base`

## Features

- Wiki: off. It would be a second, ungated home for claims that belong in `learning/`.
- Projects: off. An empty tab.
- Private vulnerability reporting: on. It is the closed channel `SECURITY.md` names.
- Automatically delete head branches on merge: on. The merged feature branches still present on the remote are deleted once.

## Merges

- Squash merging: allowed, and the only method. Merge commits and rebase merging are off.
- Require linear history on the default branch.

One pull request is one commit on `main`, which is what makes a `YYYY.MM.PATCH` tag per merge mean something a reader can diff.

## Branch protection on the default branch

- Require a pull request before merging.
- Require the branch to be up to date before merging.
- Require approvals: zero. A second-reviewer rule on a repository with one maintaining account either blocks all work or gets bypassed, and neither outcome is a review.
- Require these status checks to pass, named by their workflow job ids:
    - `links`
    - `anchors`
    - `frontmatter`
    - `banned-terms`
    - `prose-bans`
    - `spelling`
    - `casing`
    - `validation-consistency`
    - `markdownlint`
    - `starters`

The check names come from the CI workflow, so the required-checks list is applied once that workflow is on the default branch. A required check that no workflow reports blocks every merge.
