with source as (
    select * from raw.postings
),

deduplicated as (
    select
        id,
        source,
        source_id,
        title,
        description,
        company_name,
        location_name,
        date_posted,
        category,
        contract_type,
        salary_min,
        salary_max,
        salary_is_predicted,
        redirect_url,
        source_url,
        raw_payload,
        first_seen_at,
        last_seen_at,
        fetch_count,
        -- Normalize location to handle variations
        lower(trim(location_name)) as location_normalized,
        -- Extract week for aggregation
        to_char(date_trunc('week', date_posted), 'IYYY-IW') as posted_week,
        -- Flag current postings (seen in last 7 days)
        case
            when last_seen_at >= now() - interval '7 days' then true
            else false
        end as is_current
    from source
    where date_posted is not null
)

select * from deduplicated
