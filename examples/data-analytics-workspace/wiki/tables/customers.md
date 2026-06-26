---
type: Table
title: Customers Table
description: One row per customer account.
tags: [analytics, ecommerce, table, customers]
timestamp: "2026-06-26T00:00:00.000Z"
---

# Overview

`customers` stores one row per customer account in the [Ecommerce Dataset](../datasets/ecommerce.md).

# Columns

- `customer_id`: unique customer identifier.
- `created_at`: timestamp when the customer account was created.
- `country`: billing country.

# Relationships

Use [Orders To Customers](../relationships/orders-customers.md) to attach buyer attributes to orders.

# Citations

- [Ecommerce Data Dictionary](../references/ecommerce-data-dictionary.md)
