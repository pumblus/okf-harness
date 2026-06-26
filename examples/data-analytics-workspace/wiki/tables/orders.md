---
type: Table
title: Orders Table
description: One row per placed order.
tags: [analytics, ecommerce, table, orders]
timestamp: "2026-06-26T00:00:00.000Z"
---

# Overview

`orders` stores one row per placed order in the [Ecommerce Dataset](../datasets/ecommerce.md).

# Columns

- `order_id`: unique order identifier.
- `customer_id`: customer identifier that joins to [Customers Table](customers.md).
- `order_created_at`: timestamp when the order was placed.
- `order_status`: lifecycle status.
- `order_total_usd`: order total in US dollars.

# Buyer Activity Filter

Use orders with `order_status` equal to `paid`, `fulfilled`, or `shipped` when calculating buyer activity.

# Citations

- [Ecommerce Data Dictionary](../references/ecommerce-data-dictionary.md)
