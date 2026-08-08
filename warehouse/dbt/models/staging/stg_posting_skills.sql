with source as (
    select * from raw.posting_skills
),

cleaned as (
    select
        ps.posting_id,
        ps.skill,
        ps.category,
        ps.matched_alias,
        ps.char_start,
        ps.char_end,
        ps.taxonomy_version,
        ps.extractor_version,
        ps.extracted_at,
        p.source,
        p.source_id,
        p.posted_week,
        p.location_normalized,
        p.category as posting_category
    from source ps
    left join {{ ref('stg_postings') }} p on ps.posting_id = p.id
)

select * from cleaned
