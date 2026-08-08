with posting_counts as (
    select
        posted_week as week,
        source,
        location_normalized as location,
        count(distinct id) as total_postings
    from {{ ref('stg_postings') }}
    where date_posted is not null
    group by 1, 2, 3
),

skill_counts as (
    select * from {{ ref('fct_skill_mentions') }}
),

shares as (
    select
        sc.skill,
        sc.category,
        sc.week,
        sc.source,
        sc.location,
        sc.mention_count,
        pc.total_postings,
        case
            when pc.total_postings > 0
            then sc.mention_count::float / pc.total_postings
            else 0
        end as share,
        -- Suppress small samples
        case
            when pc.total_postings < 30 then true
            else false
        end as suppressed
    from skill_counts sc
    join posting_counts pc
        on sc.week = pc.week
        and sc.source = pc.source
        and sc.location = pc.location
)

select * from shares
