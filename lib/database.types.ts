export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            admin_emails: {
                Row: {
                    email: string
                    note: string | null
                    created_at: string
                }
                Insert: {
                    email: string
                    note?: string | null
                    created_at?: string
                }
                Update: {
                    email?: string
                    note?: string | null
                    created_at?: string
                }
            }
            profiles: {
                Row: {
                    user_id: string
                    nickname: string
                    department: string
                    degree: string | null
                    grade: number | null
                    major: string | null
                    avatar_url: string | null
                    is_deactivated: boolean
                    deactivated_at: string | null
                    created_at: string
                }
                Insert: {
                    user_id: string
                    nickname: string
                    department: string
                    degree?: string | null
                    grade?: number | null
                    major?: string | null
                    avatar_url?: string | null
                    is_deactivated?: boolean
                    deactivated_at?: string | null
                    created_at?: string
                }
                Update: {
                    user_id?: string
                    nickname?: string
                    department?: string
                    degree?: string | null
                    grade?: number | null
                    major?: string | null
                    avatar_url?: string | null
                    is_deactivated?: boolean
                    deactivated_at?: string | null
                    created_at?: string
                }
            }
            items: {
                Row: {
                    id: string
                    seller_id: string
                    title: string
                    original_price: number
                    selling_price: number
                    //condition: string
                    status: string
                    front_image_url: string | null
                    back_image_url: string | null
                    isbn: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    seller_id: string
                    title: string
                    original_price: number
                    selling_price: number
                    //condition: string
                    status?: string
                    front_image_url?: string | null
                    back_image_url?: string | null
                    isbn?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    seller_id?: string
                    title?: string
                    original_price?: number
                    selling_price?: number
                    //condition?: string
                    status?: string
                    front_image_url?: string | null
                    back_image_url?: string | null
                    isbn?: string | null
                    created_at?: string
                }
            }
            search_histories: {
                Row: {
                    id: string
                    user_id: string
                    keyword: string
                    searched_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    keyword: string
                    searched_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    keyword?: string
                    searched_at?: string
                }
            }
            messages: {
                Row: {
                    id: string
                    item_id: string
                    sender_id: string
                    receiver_id: string
                    message: string
                    is_read: boolean
                    created_at: string
                }
                Insert: {
                    id?: string
                    item_id: string
                    sender_id: string
                    receiver_id: string
                    message: string
                    is_read?: boolean
                    created_at?: string
                }
                Update: {
                    id?: string
                    item_id?: string
                    sender_id?: string
                    receiver_id?: string
                    message?: string
                    is_read?: boolean
                    created_at?: string
                }
            }
            transactions: {
                Row: {
                    id: string
                    item_id: string
                    buyer_id: string
                    seller_id: string
                    payment_method: string
                    meetup_time_slots: string[]
                    meetup_locations: string[]
                    final_meetup_time: string | null
                    final_meetup_location: string | null
                    status: string
                    buyer_completed: boolean
                    seller_completed: boolean
                    cancellation_reason: string | null
                    created_at: string
                    schedule_change_requested_by: string | null
                    previous_final_meetup_time: string | null
                    previous_final_meetup_location: string | null
                    handover_token: string | null
                    handover_token_expires_at: string | null
                }
                Insert: {
                    id?: string
                    item_id: string
                    buyer_id: string
                    seller_id: string
                    payment_method: string
                    meetup_time_slots: string[]
                    meetup_locations: string[]
                    final_meetup_time?: string | null
                    final_meetup_location?: string | null
                    status?: string
                    buyer_completed?: boolean
                    seller_completed?: boolean
                    cancellation_reason?: string | null
                    created_at?: string
                    schedule_change_requested_by?: string | null
                    previous_final_meetup_time?: string | null
                    previous_final_meetup_location?: string | null
                    handover_token?: string | null
                    handover_token_expires_at?: string | null
                }
                Update: {
                    id?: string
                    item_id?: string
                    buyer_id?: string
                    seller_id?: string
                    payment_method?: string
                    meetup_time_slots?: string[]
                    meetup_locations?: string[]
                    final_meetup_time?: string | null
                    final_meetup_location?: string | null
                    status?: string
                    buyer_completed?: boolean
                    seller_completed?: boolean
                    cancellation_reason?: string | null
                    created_at?: string
                    schedule_change_requested_by?: string | null
                    previous_final_meetup_time?: string | null
                    previous_final_meetup_location?: string | null
                    handover_token?: string | null
                    handover_token_expires_at?: string | null
                }
            }
            watch_keywords: {
                Row: {
                    id: string
                    user_id: string
                    keyword: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    keyword: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    keyword?: string
                    created_at?: string
                }
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            is_allowed_admin_email: {
                Args: {
                    target_email: string
                }
                Returns: boolean
            }
            is_current_user_admin: {
                Args: Record<PropertyKey, never>
                Returns: boolean
            }
            check_purchase_eligibility: {
                Args: {
                    p_buyer_id: string
                    p_item_id: string
                    p_seller_id: string
                }
                Returns: {
                    allowed: boolean
                    reason?: string
                    hours_remaining?: number
                }
            }
            is_registered_email: {
                Args: {
                    target_email: string
                }
                Returns: boolean
            }
        }
        Enums: {
            [_ in never]: never
        }
    }
}
