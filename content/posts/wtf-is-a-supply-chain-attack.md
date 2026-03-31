+++
title = "WTF is a supply chain attack"
date = 2026-03-31
description = "A quick intro to supply chain attack and axios case study"

[taxonomies]
tags = ["npm", "security", "networking"]
+++

![Axios supply chain issue screenshot](/images/axios-issue.webp)

Two major open source libraries LiteLLM and axios(still developing story) were compromised within a week of each other. In this article, you are going to learn what supply chain attacks are, why they keep working and what you need to know right now.

## What is a Supply Chain Attack?
When you write software, you pull packages written by other people like pulling packages from PyPI, npm or elsewhere. Those packages might pull in more packages of their own. That entire web of external code is your software supply chain.

A supply chain attack targets something your code actually trusts. If an attacker get malicious code into a library you install. Then, its game over. It'll have access to your files, secrets, infra.

## Axios (March 31, 2026) Issue (Still Developing)
Axios is one of the most used HTTP client library in JavaScript. This story just broke today (31st March 2026) and details are still coming, but lets just take this as a case study to understand supply chain attack clearly.

An attacker compromised the npm account of a lead axios maintainer, changed the account email id to an anon address and published two poisoned versions manually. 

The attacker added a dependency called `plain-crypto-js`. This package is never actually used by axios. It was not there previously. It's only purpose is to run a `postinstall` script that drops a Remote Access Trojan (RAT) targeting macOS, Windows and Linux. The RAT contacts a command and control server, downloads platform specific payloads, then deletes its own traces.


## What to Check Right Now
If you have installed `axios@1.14.1` or `axios@0.30.4` please remove them or revert back to a safer version. You can revert back these to `axios@1.14.0` and `axios@0.30.3`



> Update 1: The axios version has been rolled back to a safer version.
![axios-rolled-back-to-safer-version](/images/axios-rolled-back.png)


I'll update the story as new confirmed details come in.
