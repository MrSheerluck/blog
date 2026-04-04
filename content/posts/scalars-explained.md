+++
title = "Scalars Explained"
description = "In this post, we are going to learn about scalars"
date = 2026-04-05
transparent = true

[taxonomies]
tags = ["maths", "vectors", "linear-algebra", "ml"]
series = ["linear-algebra-series"]
+++


In this series we are going to learn all the maths that is required to learn machine learning or deep learning. All the post, will explain the concept, will have geometric intuition or understanding and then python code implementation. We will start from linear algebra.

## What is a Scalar?
Before going to vectors, lets first understand what is a scalar? 
A scalar is a single real number. That is the complete definition.
When we write:
$$s \in \mathbb{R} $$

We are saying: $s$ is an element of the set of all real numbers.

> Scalar has only one piece of information: its **value**.

Scalars live in $\mathbb{R}$ (the real number line). It includes every decimal, every fraction, every irrational number. Basically everything on a continuous number line.

## What Can You Do With Scalars
The standard arithmetic operations all apply:

| Operation      | Notation | Example     |
| -------------- | -------- | ----------- |
| Addition       | $a + b$  | $3 + 5 = 8$ |
| Subtraction    | $a-b$    | $3-5=-2$    |
| Multiplication | $a.b$    | $3.5=15$    |
| Division       | $a/b$    | $3/5=0.6$   |

These operations always produce another scalar. The output stays in $\mathbb{R}$.

## Why Scalars Are Not Enough
Let's say you want to describe how an object is moving through 3D space. The object moves at 60 km/h. But 60 km/h where? Diagonally upward? A scalar cannot encode this. You need to know both how much (magnitude) and which way (direction)

In ML, you have a house with features: area = 1200 sq ft, bedrooms = 3, age = 10 years, price = $250,000. These are four separate scalars. But a model needs to process them together as one object, not as four disconnected numbers. A scalar cannot represent structured, multi-dimensional data.

This is the fundamental limitation of scalars:
> A scalar carries magnitude (size/value) only. It carries no directional or structural information.

## The Two Things We Need That Scalars Cannot Provide
1. Direction - When a quantity has both a size and direction like displacement, velocity, force. Here, a single number is insufficient. You need a mathematical object that encodes both simultaneously.
2. Structure across multiple dimensions - When data has multiple features that belong together as one unit like a data point in ML, you need an object that holds all dimensions at once and supports operations across them.

Both the things can be done with **vectors**, which is what we study from next article.

## Conclusion
This was a quick one. In the next one you'll learn about vectors and vector spaces. See you soon.
