"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import { clearAppImageCache } from '@/lib/client-image-cache';
import { clearUserLocalCaches } from '@/lib/client-user-cache';

type AuthContextType = {
    user: User | null;
    loading: boolean;
    profileReady: boolean;
    avatarUrl: string | null;
    isAppReviewDemo: boolean;
    signOut: () => Promise<void>;
    refreshAvatar: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    profileReady: false,
    avatarUrl: null,
    isAppReviewDemo: false,
    signOut: async () => { },
    refreshAvatar: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [profileReady, setProfileReady] = useState(false);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [isAppReviewDemo, setIsAppReviewDemo] = useState(false);
    const router = useRouter();
    const pathname = usePathname();

    // プロフィール行を1回だけ読み、アバター・デモ判定・存在確認をまとめて返す
    const fetchAvatarUrl = useCallback(async (userId: string): Promise<boolean> => {
        setProfileReady(false);
        try {
            const { data } = await supabase
                .from("profiles")
                .select("user_id, avatar_url, is_app_review_demo")
                .eq("user_id", userId)
                .maybeSingle();

            if (data) {
                setAvatarUrl((data as any).avatar_url || null);
                setIsAppReviewDemo(Boolean((data as any).is_app_review_demo));
                return true;
            }
            setAvatarUrl(null);
            setIsAppReviewDemo(false);
            return false;
        } catch (err) {
            console.error("Error fetching avatar:", err);
            setAvatarUrl(null);
            setIsAppReviewDemo(false);
            return false;
        } finally {
            setProfileReady(true);
        }
    }, []);

    // profileExistsPromise: fetchAvatarUrl のプロフィール存在判定を再利用し、profiles の重複読みを避ける
    const runPostAuthChecks = useCallback(async (currentUser: User, profileExistsPromise?: Promise<boolean>) => {
        const excludedPaths = ['/suspended', '/auth/'];
        const isExcluded = excludedPaths.some(p => pathname.startsWith(p));

        if (isExcluded) return;

        try {
            const { data: restriction, error: restrictionError } = await supabase
                .from('user_restrictions')
                .select('restriction_type, ends_at, lifted_at')
                .eq('user_id', currentUser.id)
                .in('restriction_type', ['temporary_suspend', 'permanent_ban'])
                .is('lifted_at', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (restrictionError) {
                console.error("Error checking user restriction:", restrictionError);
            }

            if (restriction) {
                const res = restriction as any;
                if (res.restriction_type === 'temporary_suspend' && res.ends_at) {
                    if (new Date(res.ends_at) > new Date()) {
                        router.replace('/suspended');
                        return;
                    }
                } else if (res.restriction_type === 'permanent_ban') {
                    router.replace('/suspended');
                    return;
                }
            }

            // fetchAvatarUrl が並行して読んだ存在判定を再利用（無ければ単独で確認）
            let profileExists: boolean;
            if (profileExistsPromise) {
                profileExists = await profileExistsPromise;
            } else {
                const { data: profile, error: profileError } = await (supabase
                    .from("profiles") as any)
                    .select("user_id")
                    .eq("user_id", currentUser.id)
                    .maybeSingle();
                if (profileError) {
                    console.error("Error checking profile:", profileError);
                    return;
                }
                profileExists = Boolean(profile);
            }

            if (!profileExists) {
                router.replace('/auth/setup-profile');
            }
        } catch (err) {
            console.error("Error running post-auth checks:", err);
        }
    }, [pathname, router]);

    useEffect(() => {
        let isMounted = true;

        const initAuth = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const currentUser = session?.user ?? null;

                if (!isMounted) return;

                setUser(currentUser);

                if (currentUser) {
                    const profileExistsPromise = fetchAvatarUrl(currentUser.id);
                    // 制限チェック等はブロッキングしない（loading を待たせない）
                    void runPostAuthChecks(currentUser, profileExistsPromise);
                } else {
                    setAvatarUrl(null);
                    setIsAppReviewDemo(false);
                    setProfileReady(true);
                }
            } catch (err) {
                console.error("Error initializing auth:", err);
                if (isMounted) {
                    setUser(null);
                    setAvatarUrl(null);
                    setIsAppReviewDemo(false);
                    setProfileReady(true);
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        void initAuth();

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            const currentUser = session?.user ?? null;
            if (!isMounted) return;

            setUser(currentUser);

            if (currentUser) {
                const profileExistsPromise = fetchAvatarUrl(currentUser.id);
                window.setTimeout(() => {
                    if (isMounted) {
                        void runPostAuthChecks(currentUser, profileExistsPromise);
                    }
                }, 0);
            } else {
                setAvatarUrl(null);
                setIsAppReviewDemo(false);
                setProfileReady(true);
            }

            setLoading(false);
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, [fetchAvatarUrl, runPostAuthChecks]);

    const signOut = useCallback(async () => {
        const currentUserId = user?.id ?? null;
        setUser(null);
        clearUserLocalCaches(currentUserId);
        void clearAppImageCache();
        await supabase.auth.signOut();
        setAvatarUrl(null);
        setIsAppReviewDemo(false);
        setProfileReady(true);
    }, [user?.id]);

    const refreshAvatar = useCallback(async () => {
        if (user) {
            await fetchAvatarUrl(user.id);
        }
    }, [user, fetchAvatarUrl]);

    const value = useMemo(() => ({
        user,
        loading,
        profileReady,
        avatarUrl,
        isAppReviewDemo,
        signOut,
        refreshAvatar
    }), [user, loading, profileReady, avatarUrl, isAppReviewDemo, signOut, refreshAvatar]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
