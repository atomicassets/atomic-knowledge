---
scope: Promotion gate for the unverified knowledge tier - what belongs in learning/, how an entry gets promoted, and what never enters this directory
depends-on: []
key-modules: []
---

# Learning log instructions

`learning/` holds unverified or in-progress facts about the Atomic ecosystem. Nothing enters the polished tier (`reference/`, `guides/`) unvalidated. This file is the gate between the two; it does not itself hold candidate entries.

## What belongs here

A fact that is plausible but not yet checked against a source: a hunch from reading a changelog, an inference from an error message, a claim from an external report, a behavior seen once and not yet reproduced. If it has not been checked against contract source at a pinned tag or against a live chain/API read, it stays here, however confident the write-up sounds.

## Charter: atomic-ecosystem only

This log covers AtomicAssets, AtomicMarket, the atomicassets-api indexer and its hosted API, and the chain/client behavior around them. Generic tech knowledge (Nix, CI tooling, unrelated libraries) does not belong here even if discovered while working on this repository.

R1 scope is the core assets/market/API surface. Drops, packs, and EVM chains are post-R1: knowledge about them lives here, unvalidated, until an R1-equivalent validation pass covers them, even if the underlying fact turns out to be solid.

## Entry format

Each entry names its category file (matching the polished-tier area it will eventually feed) and carries:

- **Claim.** The fact, stated plainly, one claim per entry.
- **How it would be validated.** Either "read `<contract>` source at `<pinned tag>`" or "confirm against a live read of `<chain endpoint or API>`". State which, and why that check would settle the claim.
- **Promote to:** the target polished file (e.g. `reference/atomicmarket/actions.md`) the claim would land in once validated.

An entry with no `Promote to:` line has no destination yet and should say so rather than guessing one.

## Verification tiers

These tiers are used by `validation-log.md` at the repo root to record how each polished fact was checked:

- **source-read**: verified by reading the pinned contract (or library) source directly; the fact is a property of code that does not change without a new release.
- **live-chain**: confirmed by an actual read against a live endpoint (a nodeos RPC call or a hosted API request); the fact is a property of observed behavior at the time of the read.
- **both**: the page states some facts of each kind, or a single fact was cross-checked both ways.

## Promotion

Promotion means: the claim is checked against source or a live read, the result matches (or corrects) the claim, the corrected claim is written into the named polished file with its own `Source:` citation, and the validation log is updated. Once promoted, the learning entry is deleted. Git history is the archive; there is no need to keep a record of it here.

## Current state

This log starts empty. Everything shipped in `reference/` and `guides/` at repository creation was already validated before it landed there, so there is nothing pending promotion yet. New entries arrive as work on drops, packs, EVM chains, or any other unvalidated claim begins.
