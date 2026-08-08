with mentions as (
    select * from {{ ref('stg_posting_skills') }}
),

grouped as (
    select
        skill,
        category,
        posted_week as week,
        source,
        location_normalized as location,
        count(distinct posting_id) as mention_count,
        count(distinct source_id) as unique_postings
    from mentions
    where posted_week is not null
    group by 1, 2, 3, 4, 5
)

select * from grouped
