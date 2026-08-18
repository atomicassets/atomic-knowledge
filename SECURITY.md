# Security

A page in `reference/` or `guides/` that misstates contract behavior can send an integrator to production on a false assumption, which is the one security-relevant failure this repository can produce. Report it through private vulnerability reporting on this repository when the report should stay closed until the page is fixed, and through the fact-error issue form otherwise.

A vulnerability in a contract itself goes to the repository that carries the code, `atomicassets/atomicassets-contract` or `atomicassets/atomicmarket-contract`, rather than here. This repository holds documentation and sample code and runs no service, so it has nothing deployed to patch.
