with skill_list as (
    select distinct
        skill,
        category,
        taxonomy_version
    from {{ ref('stg_posting_skills') }}
)

select
    row_number() over () as skill_id,
    skill,
    category,
    taxonomy_version
from skill_list
