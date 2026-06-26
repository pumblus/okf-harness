# Ecommerce Data Dictionary

The ecommerce analytics dataset contains order and customer records used for monthly buyer reporting.

## Dataset

`ecommerce` is the reporting dataset for customer purchases.

## Tables

`orders` has one row per placed order.

Columns:

- `order_id`: unique order identifier.
- `customer_id`: customer identifier that joins to `customers.customer_id`.
- `order_created_at`: timestamp when the order was placed.
- `order_status`: lifecycle status. Count only `paid`, `fulfilled`, or `shipped` for buyer activity.
- `order_total_usd`: order total in US dollars.

`customers` has one row per customer account.

Columns:

- `customer_id`: unique customer identifier.
- `created_at`: timestamp when the customer account was created.
- `country`: billing country.

## Metric

Monthly active buyers is the number of distinct `orders.customer_id` values with at least one qualifying order in the calendar month. Qualifying orders have `order_status` equal to `paid`, `fulfilled`, or `shipped`.

## Join Path

Join `orders.customer_id` to `customers.customer_id` when buyer attributes such as country or customer creation date are needed.
