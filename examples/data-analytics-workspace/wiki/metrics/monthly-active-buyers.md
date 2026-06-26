---
type: Metric
title: Monthly Active Buyers
description: Distinct customers with at least one qualifying order in a calendar month.
tags: [analytics, ecommerce, metric, buyers]
timestamp: "2026-06-26T00:00:00.000Z"
---

# Definition

Monthly active buyers is the number of distinct `orders.customer_id` values with at least one qualifying order in the calendar month.

# Qualification

An order qualifies when `order_status` is `paid`, `fulfilled`, or `shipped`.

# Grain

The metric is reported by calendar month based on `orders.order_created_at`.

# Source Tables

- [Orders Table](../tables/orders.md)
- [Customers Table](../tables/customers.md), only when buyer attributes are needed.

# Citations

- [Ecommerce Data Dictionary](../references/ecommerce-data-dictionary.md)
