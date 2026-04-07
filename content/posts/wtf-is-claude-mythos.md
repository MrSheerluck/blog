+++
title = "WTF is Claude Mythos"
description = "Everything we know about Anthropic's Claude Mythos model"
date = 2026-04-08
transparent = true

[taxonomies]
tags = ["ai", "anthropic", "security"]
+++

# WTF is Claude Mythos

Anthropic didn't announce Mythos. It leaked. A misconfigured CMS left a draft blog post in a publicly searchable data store. Security researchers found it and Anthropic confirmed it shortly after.

In this article you are going to learn what Mythos is, what it can actually do, and why Anthropic is scared of releasing it.

## What is Mythos?

Mythos is Anthropic's next model. It sits in a new tier above Opus, both in capability and cost. Internally they called this tier Capybara.

It is a general-purpose model. But it is strikingly capable at cybersecurity tasks specifically. Where prior Claude models respond to instructions one step at a time, Mythos plans and executes sequences of actions on its own, moving across systems and completing operations without waiting for human input at each stage.

Here are the benchmark numbers from Anthropic's own evaluation on agentic coding:

| Benchmark | Mythos Preview | Opus 4.6 |
|---|---|---|
| SWE-bench Pro | 77.8% | 53.4% |
| Terminal-Bench 2.0 | 82.0% | 65.4% |
| SWE-bench Multimodal | 59.0% | 27.1% |
| SWE-bench Multilingual | 87.3% | 77.8% |
| SWE-bench Verified | 93.9% | 80.8% |

These are not small improvements.

## What Can It Actually Do

This is where it gets serious.

During testing, Mythos Preview was capable of identifying and exploiting zero-day vulnerabilities in every major operating system and every major web browser. Many of the vulnerabilities it found are ten or twenty years old. The oldest being a 27-year-old bug in OpenBSD.

In one case it wrote a browser exploit that chained together four vulnerabilities, writing a complex JIT heap spray that escaped both the renderer and OS sandboxes. It autonomously obtained local privilege escalation on Linux by exploiting subtle race conditions and KASLR bypasses. It also wrote a remote code execution exploit on FreeBSD's NFS server that granted full root access to unauthenticated users by splitting a 20-gadget ROP chain over multiple packets.

The numbers make this concrete. Opus 4.6 turned Firefox 147 JavaScript engine vulnerabilities into working shell exploits only 2 times out of several hundred attempts. Mythos Preview developed working exploits 181 times on the same benchmark.

These capabilities were not explicitly trained into Mythos Preview. They emerged as a downstream consequence of general improvements in code, reasoning, and autonomy. The same improvements that make it better at patching vulnerabilities also make it better at exploiting them.

## Why It Is Not Public

Mythos Preview can find tens of thousands of vulnerabilities that even an advanced bug hunter would struggle to find, and it can write the exploits to go with them.

It is also extremely compute-intensive and expensive to run at scale. Anthropic has stated it is working on efficiency improvements before any general release.

So it is dangerous and expensive. Both problems they need to solve before shipping it broadly.

## What They Did Instead: Project Glasswing

On April 7, Anthropic launched Project Glasswing. More than 40 partner organizations get access to Mythos Preview strictly for defensive security work, scanning their own code and open-source software for vulnerabilities. Partners include Amazon, Apple, Microsoft, Cisco, CrowdStrike, Palo Alto Networks, and the Linux Foundation. Findings will be shared across the industry.

Anthropic is providing up to $100 million in usage credits to participating companies and $4 million to open-source security organizations including OpenSSF, Alpha-Omega, and the Apache Software Foundation.

Over 99% of the vulnerabilities found have not yet been patched, so details cannot be disclosed publicly yet. For findings they cannot discuss, Anthropic is publishing SHA-3 cryptographic commitments as proof they hold the findings. These will be revealed once responsible disclosure is complete.

There is no public release date.

## Conclusion

This was a big one. Mythos is real, it is the most capable model Anthropic has built, and it is deliberately locked away until they figure out how to release it safely. Project Glasswing is their attempt to use it for good in the meantime.


## Resources

- Anthropic Red Team: [Assessing Claude Mythos Preview's cybersecurity capabilities](https://red.anthropic.com/2026/mythos-preview/)
- Axios: [Anthropic withholds Mythos Preview over hacking concerns](https://www.axios.com/2026/04/07/anthropic-mythos-preview-cybersecurity-risks)
- TechCrunch: [Anthropic debuts Mythos preview in new cybersecurity initiative](https://techcrunch.com/2026/04/07/anthropic-mythos-ai-model-preview-security/)
- Fortune: [Anthropic confirms Mythos after data leak](https://fortune.com/2026/03/26/anthropic-says-testing-mythos-powerful-new-ai-model-after-data-leak-reveals-its-existence-step-change-in-capabilities/)
- Bloomberg: [Anthropic lets Apple, Amazon test Mythos](https://www.bloomberg.com/news/articles/2026-04-07/anthropic-lets-apple-amazon-test-more-powerful-mythos-ai-model)
