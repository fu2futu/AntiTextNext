-- 登録途中(メール未認証)のアカウントを判定するための関数。
-- signup-eligibility API(service_role)から呼び出し、未認証のまま一定時間経過した
-- アカウントを削除して再登録できるようにする。
CREATE OR REPLACE FUNCTION public.get_signup_email_status(target_email TEXT)
RETURNS TABLE (
    user_id UUID,
    is_confirmed BOOLEAN,
    last_sent_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT
        id,
        email_confirmed_at IS NOT NULL,
        COALESCE(confirmation_sent_at, created_at)
    FROM auth.users
    WHERE email = LOWER(TRIM(target_email))
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_signup_email_status(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_signup_email_status(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.get_signup_email_status(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_signup_email_status(TEXT) TO service_role;
