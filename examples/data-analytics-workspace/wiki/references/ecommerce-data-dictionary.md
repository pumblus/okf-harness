---
type: Reference
title: Ecommerce Data Dictionary
description: Synthetic source describing ecommerce tables, metric logic, and join paths.
resource: raw/sources/2026/06/ecommerce-data-dictionary.md
tags: [analytics, ecommerce, source]
timestamp: "2026-06-26T00:00:00.000Z"
okfh:
  source_id: src_20260626_0001
  source_sha256: 3bcb8d4fe1a964d769c3c0d58ff006d05547993491d243b2dc517972acf93cf6
  status: active
---

# Summary

The source defines the ecommerce dataset, orders and customers tables, monthly active buyers metric, and orders-to-customers join path.

# Key Points

- `orders` has one row per placed order.
- `customers` has one row per customer account.
- Monthly active buyers counts distinct `orders.customer_id` values with a qualifying order in the calendar month.
- Qualifying order statuses are `paid`, `fulfilled`, and `shipped`.
- Join `orders.customer_id` to `customers.customer_id` for buyer attributes.

# Citations

- src_20260626_0001
