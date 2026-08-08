with weeks as (
    select distinct
        posted_week as week_id,
        date_trunc('week', date_posted) as week_start,
        date_trunc('week', date_posted) + interval '6 days' as week_end,
        extract(isoyear from date_posted) as iso_year,
        extract(week from date_posted) as iso_week
    from {{ ref('stg_postings') }}
    where date_posted is not null
)

select * from weeks
order by week_start
