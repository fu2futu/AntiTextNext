"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Send, Loader2, Check, CheckCheck, Calendar, MapPin, Clock, RotateCcw, RefreshCw, ImageIcon, Plus, X as XIcon, ChevronRight, CheckCircle2, AlertCircle, Package, XCircle, BookOpen, Star } from "lucide-react";
import { memo, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";
import { ALLOWED_IMAGE_ACCEPT, assertAllowedImageFile, uploadChatImage } from "@/lib/image-storage";
import { INPUT_LIMITS } from "@/lib/input-limits";
import { RewardAvatar } from "@/components/reward-avatar";
import { resolveEarlyRegistrationEligible, type RewardOverride, type RewardSetting } from "@/lib/rewards";

type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  image_url?: string | null;
  is_read: boolean;
  created_at: string;
};

type ItemWithTransaction = {
  id: string;
  title: string;
  seller_id: string;
  status: string;
};

type Transaction = {
  id: string;
  item_id: string;
  buyer_id: string;
  seller_id: string;
  payment_method: string;
  meetup_time_slots: string[];
  meetup_locations: string[];
  final_meetup_time: string | null;
  final_meetup_location: string | null;
  status: string;
  buyer_completed: boolean;
  seller_completed: boolean;
  cancellation_reason: string | null;
  decline_reason?: string | null;
  declined_at?: string | null;
  schedule_change_requested_by: string | null;
  previous_final_meetup_time: string | null;
  previous_final_meetup_location: string | null;
};

type UserProfile = {
  avatar_url: string | null;
  nickname: string;
  is_deactivated?: boolean;
  created_at?: string | null;
  listing_count?: number;
  early_registration?: boolean;
};

const TIME_SLOT_LABELS: Record<string, string> = {
  "12period": "12限終わり休み",
  "lunch": "お昼休み",
  "56period": "56限終わり休み",
  "78period": "78限終わり休み",
  "other": "その他",
};

const LOCATION_LABELS: Record<string, string> = {
  library: "図書館前",
  taki_plaza: "タキプラザ一階",
  seven_eleven: "セブンイレブン前",
  other: "その他（チャットで相談）",
};

const formatTimeSlotLabel = (timeSlot: string) => {
  const [datePart, slotPart] = timeSlot.split("_");
  const date = new Date(datePart);
  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
  return `${date.getMonth() + 1}/${date.getDate()}(${dayNames[date.getDay()]}) ${TIME_SLOT_LABELS[slotPart] || slotPart}`;
};

const formatLocationLabel = (location: string) => LOCATION_LABELS[location] || location;

const formatScheduleCandidates = (slots: string[], locations: string[]) => {
  const formattedSlots = slots.map((slot) => `・${formatTimeSlotLabel(slot)}`).join("\n");
  const formattedLocations = locations.map((location) => `・${formatLocationLabel(location)}`).join("\n");

  return `候補日時:\n${formattedSlots}\n\n候補場所:\n${formattedLocations}`;
};

export default function ChatPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetTransactionId = searchParams.get("tx");
  const { user, loading: authLoading, avatarUrl } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasDraftMessage, setHasDraftMessage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [item, setItem] = useState<ItemWithTransaction | null>(null);
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [otherUserProfile, setOtherUserProfile] = useState<UserProfile | null>(null);
  const [ownAvatarReward, setOwnAvatarReward] = useState({ listingCount: 0, earlyRegistration: false });
  const [accessDenied, setAccessDenied] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [isCancellationModalOpen, setIsCancellationModalOpen] = useState(false);
  const [isCancellationReasonModalOpen, setIsCancellationReasonModalOpen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isScheduleCandidatesOpen, setIsScheduleCandidatesOpen] = useState(false);
  const [isDeclineModalOpen, setIsDeclineModalOpen] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [backHref, setBackHref] = useState("/transactions");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const loadedRef = useRef<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const userScrolledUpRef = useRef(false);
  const previousMessagesLengthRef = useRef(0);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const inputFocusedRef = useRef(false);
  const composingRef = useRef(false);
  const lastInputAtRef = useRef(0);

  const isUserTyping = useCallback(() => {
    return inputFocusedRef.current || composingRef.current || Date.now() - lastInputAtRef.current < 1200;
  }, []);

  const resizeMessageInput = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
  }, []);

  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get("from");
    setBackHref(from === "notifications" ? "/notifications" : "/transactions");
  }, []);

  // 未読メッセージを既読にする
  const markMessagesAsRead = useCallback(async () => {
    if (!user || !params.id) return;

    try {
      const { error: messagesError } = await (supabase.from("messages") as any)
        .update({ is_read: true })
        .eq("item_id", params.id)
        .eq("receiver_id", user.id)
        .eq("is_read", false);

      if (messagesError) throw messagesError;

      const { error: notificationsError } = await (supabase.from("notifications") as any)
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("link_type", "chat")
        .eq("link_id", params.id)
        .eq("is_read", false);

      if (notificationsError) {
        console.error("Error marking chat notifications as read:", notificationsError);
      }

      setMessages(current =>
        current.map(message =>
          message.receiver_id === user.id ? { ...message, is_read: true } : message
        )
      );
    } catch (err) {
      console.error("Error marking messages as read:", err);
    }
  }, [params.id, user]);

  // メッセージ取得関数
  const fetchMessages = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("item_id", params.id)
        .order("created_at", { ascending: true });

      if (!error && data) {
        const realMessages = (data as Message[]).filter((message) => {
          if (!otherUserId) return false;
          return (
            (message.sender_id === user.id && message.receiver_id === otherUserId) ||
            (message.sender_id === otherUserId && message.receiver_id === user.id)
          );
        });
        setMessages(prev => {
          const tempMessages = prev.filter(m => m.id.startsWith('temp-'));
          const filteredTemp = tempMessages.filter(temp =>
            !realMessages.some(real =>
              real.sender_id === temp.sender_id &&
              real.message === temp.message
            )
          );
          const nextMessages = [...realMessages, ...filteredTemp];
          if (
            nextMessages.length === prev.length &&
            nextMessages.every((message, index) => {
              const current = prev[index];
              return current &&
                current.id === message.id &&
                current.is_read === message.is_read &&
                current.message === message.message;
            })
          ) {
            return prev;
          }
          return nextMessages;
        });

        // 自分宛ての未読メッセージがあれば既読にする
        const hasUnread = realMessages.some(m =>
          m.receiver_id === user.id && !m.is_read
        );
        if (hasUnread) {
          markMessagesAsRead();
        }
      }
    } catch (err) {
      console.error("Error fetching messages:", err);
    }
  }, [params.id, user, otherUserId, markMessagesAsRead]);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/auth/login");
      return;
    }

    if (loadedRef.current === params.id) return;
    loadedRef.current = params.id;
    loadItemAndMessages();
  }, [params.id, user, authLoading, router]);

  useEffect(() => {
    if (!user || !otherUserId) return;
    // リアルタイム購読
    const channel = supabase
      .channel(`item-chat-${params.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `item_id=eq.${params.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newMsg = payload.new as Message;
            setMessages((current) => {
              if (current.some(m => m.id === newMsg.id)) return current;
              const filtered = current.filter(m =>
                !m.id.startsWith('temp-') ||
                (m.message !== newMsg.message || m.sender_id !== newMsg.sender_id)
              );
              return [...filtered, newMsg];
            });
            // 自分宛てなら既読にする
            if (newMsg.receiver_id === user.id) {
              markMessagesAsRead();
            }
          } else if (payload.eventType === "UPDATE") {
            const updatedMsg = payload.new as Message;
            setMessages(current => {
              let changed = false;
              const nextMessages = current.map((message) => {
                if (message.id !== updatedMsg.id) return message;
                if (
                  message.is_read === updatedMsg.is_read &&
                  message.message === updatedMsg.message &&
                  message.image_url === updatedMsg.image_url
                ) {
                  return message;
                }
                changed = true;
                return updatedMsg;
              });
              return changed ? nextMessages : current;
            });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "transactions",
          filter: `item_id=eq.${params.id}`,
        },
        (payload) => {
          setTransaction(payload.new as Transaction);
        }
      )
      .subscribe();

    // ポーリング: 3秒ごとにメッセージを取得
    pollingRef.current = setInterval(() => {
      if (isUserTyping()) return;
      fetchMessages();
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [params.id, user, otherUserId, fetchMessages, markMessagesAsRead, isUserTyping]);

  useEffect(() => {
    // 新しいメッセージが追加された場合のみスクロール
    const hasNewMessages = messages.length > previousMessagesLengthRef.current;
    previousMessagesLengthRef.current = messages.length;

    // ユーザーが上にスクロールしていない場合、または新しいメッセージがある場合のみスクロール
    if (hasNewMessages && !userScrolledUpRef.current && !isUserTyping()) {
      scrollToBottom();
    }
  }, [messages, isUserTyping]);

  const scrollToBottom = (force?: boolean) => {
    if (force) {
      userScrolledUpRef.current = false;
    }
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: isUserTyping() ? "auto" : "smooth",
      });
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: isUserTyping() ? "auto" : "smooth" });
  };

  // スクロール位置を監視してユーザーが上にスクロールしたかを追跡
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    // 下から100px以内にいる場合はボトムにいると判定
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    userScrolledUpRef.current = !isNearBottom;
  }, []);

  const loadItemAndMessages = async () => {
    if (!user) return;

    try {
      const itemPromise = supabase
        .from("items")
        .select("id, title, seller_id, status")
        .eq("id", params.id)
        .single();

      const messagesPromise = supabase
        .from("messages")
        .select("*")
        .eq("item_id", params.id)
        .order("created_at", { ascending: true });

      // 現在ユーザーが参加している取引だけを取得する。
      // tx が指定されていれば、複数 requested がある商品でも対象スレッドを固定する。
      let transactionQuery = (supabase as any)
        .from("transactions")
        .select("*")
        .eq("item_id", params.id)
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`);

      if (targetTransactionId) {
        transactionQuery = transactionQuery.eq("id", targetTransactionId);
      } else {
        transactionQuery = transactionQuery.order("created_at", { ascending: false }).limit(1);
      }

      const transactionPromise = transactionQuery.maybeSingle();

      const [itemResult, messagesResult, transactionResult] = await Promise.all([
        itemPromise,
        messagesPromise,
        transactionPromise
      ]) as [any, any, any];

      if (itemResult.error) throw itemResult.error;

      if (itemResult.data) {
        const itemData = itemResult.data;
        const buyerId = transactionResult.data?.buyer_id;
        const sellerId = itemData.seller_id;

        // アクセス権チェック:
        // 1. 出品者 or 購入者であること
        // 2. どちらでもない場合、メッセージの参加者であること（フォールバック）
        const isParticipant = user.id === buyerId || user.id === sellerId;

        if (!isParticipant) {
          // トランザクションが見つからない場合でも、
          // メッセージの送受信者ならアクセスを許可
          const msgs = (messagesResult.data || []) as any[];
          const hasMessages = msgs.some(
            (m: any) => m.sender_id === user.id || m.receiver_id === user.id
          );
          if (!hasMessages) {
            setAccessDenied(true);
            setLoading(false);
            return;
          }
        }

        setItem({
          id: itemData.id,
          title: itemData.title,
          seller_id: itemData.seller_id,
          status: itemData.status,
        });

        if (transactionResult.data) {
          setTransaction(transactionResult.data as Transaction);
        }

        const other = user.id === sellerId ? buyerId : sellerId;
        setOtherUserId(other);

        if (other) {
          const [
            { data: profileData },
            { count: otherListingCount },
            { data: rewardSetting },
            { data: otherRewardOverride },
            { count: ownListingCount },
            { data: ownRewardOverride },
          ] = await Promise.all([
            supabase
              .from("profiles")
              .select("avatar_url, nickname, is_deactivated, created_at")
              .eq("user_id", other)
              .single(),
            supabase
              .from("items")
              .select("*", { count: "exact", head: true })
              .eq("seller_id", other)
              .neq("status", "deleted"),
            (supabase as any)
              .from("reward_settings")
              .select("*")
              .eq("id", "early_registration")
              .single(),
            (supabase as any)
              .from("user_reward_overrides")
              .select("early_registration_override")
              .eq("user_id", other)
              .maybeSingle(),
            supabase
              .from("items")
              .select("*", { count: "exact", head: true })
              .eq("seller_id", user.id)
              .neq("status", "deleted"),
            (supabase as any)
              .from("user_reward_overrides")
              .select("early_registration_override")
              .eq("user_id", user.id)
              .maybeSingle(),
          ]);

          const setting = rewardSetting as RewardSetting | null;

          if (profileData) {
            const profile = profileData as UserProfile;
            if (profile.is_deactivated) {
              setOtherUserProfile({
                avatar_url: null,
                nickname: "退会済みユーザー",
                is_deactivated: true,
                listing_count: 0,
                early_registration: false,
              });
            } else {
              setOtherUserProfile({
                ...profile,
                listing_count: otherListingCount ?? 0,
                early_registration: resolveEarlyRegistrationEligible(
                  profile.created_at,
                  setting,
                  otherRewardOverride as RewardOverride | null
                ),
              });
            }
          }

          setOwnAvatarReward({
            listingCount: ownListingCount ?? 0,
            earlyRegistration: resolveEarlyRegistrationEligible(
              user.created_at,
              setting,
              ownRewardOverride as RewardOverride | null
            ),
          });
        }
      }

      if (messagesResult.error) throw messagesResult.error;
      if (messagesResult.data) {
        const tx = transactionResult.data as Transaction | null;
        const otherId = tx ? (user.id === tx.buyer_id ? tx.seller_id : tx.buyer_id) : otherUserId;
        setMessages((messagesResult.data as Message[]).filter((message) => {
          if (!otherId) return false;
          return (
            (message.sender_id === user.id && message.receiver_id === otherId) ||
            (message.sender_id === otherId && message.receiver_id === user.id)
          );
        }));
        // 初回読み込み時に既読にする
        markMessagesAsRead();
      }
    } catch (err) {
      console.error("Error loading data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (textOverride?: string, imageUrlOverride?: string) => {
    const messageText = textOverride || inputRef.current?.value.trim() || "";
    if (!messageText && !imageUrlOverride) return;
    if (!user || !item || !otherUserId || sending) return;
    if (!textOverride && messageText.length > INPUT_LIMITS.chatMessageMax) {
      alert(`メッセージは${INPUT_LIMITS.chatMessageMax}文字以内で入力してください`);
      return;
    }

    if (!textOverride) {
      if (inputRef.current) {
        inputRef.current.value = "";
        resizeMessageInput();
      }
      setHasDraftMessage(false);
    }
    setSending(true);

    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      sender_id: user.id,
      receiver_id: otherUserId,
      message: messageText,
      image_url: imageUrlOverride,
      is_read: false,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, tempMessage]);
    requestAnimationFrame(() => scrollToBottom(true));

    try {
      const { error } = await (supabase.from("messages") as any).insert({
        item_id: item.id,
        sender_id: user.id,
        receiver_id: otherUserId,
        message: messageText,
        image_url: imageUrlOverride,
        is_read: false,
      });

      if (error) throw error;

      fetch("/api/notify/transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "message",
          itemId: item.id,
          receiverId: otherUserId,
          extraData: {
            transactionId: transaction?.id,
            preview: imageUrlOverride ? "画像が送信されました" : messageText,
          },
        }),
      }).catch(e => console.error(e));

      // Realtimeで基本反映されるため、入力再開中は送信後の再取得を遅らせる。
      setTimeout(() => {
        if (!isUserTyping()) {
          fetchMessages();
        }
      }, 800);
    } catch (err: any) {
      setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
      if (!textOverride) {
        if (inputRef.current) {
          inputRef.current.value = messageText;
          resizeMessageInput();
        }
        setHasDraftMessage(messageText.trim().length > 0);
      }
      alert("メッセージの送信に失敗しました: " + err.message);
    } finally {
      setSending(false);
      // iOS/Chromeでは送信直後の強制focusが日本語IMEの初動を重くすることがある。
      if (!imageUrlOverride && document.activeElement !== inputRef.current) {
        inputRef.current?.focus({ preventScroll: true });
      }
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !item || !otherUserId || isUploadingImage || sending) return;

    try {
      assertAllowedImageFile(file);
    } catch (error: any) {
      alert(error.message || 'アップロードできない画像です');
      e.target.value = "";
      return;
    }

    setIsUploadingImage(true);
    try {
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const publicUrl = await uploadChatImage(file, `${item.id}/${fileName}`);

      await handleSend("[画像]", publicUrl);

    } catch (err: any) {
      console.error('Image upload failed:', err);
      alert('画像のアップロードに失敗しました: ' + err.message);
    } finally {
      setIsUploadingImage(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleFinalizeSchedule = async (timeSlot: string, location: string) => {
    if (!transaction || isFinalizing || !canConfirmSchedule) return;
    setIsFinalizing(true);

    try {
      const formattedTime = formatTimeSlotLabel(timeSlot);
      const formattedLocation = formatLocationLabel(location);
      const isChangeApproval = !!transaction.schedule_change_requested_by;

      const { error } = await (supabase.from("transactions") as any)
        .update({
          final_meetup_time: formattedTime,
          final_meetup_location: formattedLocation,
          status: 'scheduled',
          schedule_change_requested_by: null,
        })
        .eq("id", transaction.id);

      if (error) throw error;

      // ローカル状態を即座に更新（即時UI反映のため）
      setTransaction(prev => prev ? {
        ...prev,
        final_meetup_time: formattedTime,
        final_meetup_location: formattedLocation,
        status: 'scheduled',
        schedule_change_requested_by: null,
        previous_final_meetup_time: null,
        previous_final_meetup_location: null,
      } : prev);

      // 自動メッセージを送信
      await handleSend(`${isChangeApproval ? "【日程変更が承認されました】" : "【受け渡し日時が決まりました】"}\n\n日時: ${formattedTime}\n場所: ${formattedLocation}\n\n当日はよろしくお願いいたします！`);

    } catch (err: any) {
      alert("日程の確定に失敗しました: " + err.message);
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleReschedule = async () => {
    if (!transaction || isFinalizing) return;
    if (user?.id !== transaction.buyer_id && user?.id !== transaction.seller_id) return;
    if (transaction.final_meetup_time) return;
    setIsFinalizing(true);
    try {
      const nextStatus = 'scheduling';

      // 既存候補を取り下げてから、新しい候補を入力できる状態にする。
      const { error } = await (supabase.from("transactions") as any)
        .update({
          meetup_time_slots: [],
          meetup_locations: [],
          final_meetup_time: null,
          final_meetup_location: null,
          status: nextStatus,
          schedule_change_requested_by: null,
          previous_final_meetup_time: null,
          previous_final_meetup_location: null,
        })
        .eq("id", transaction.id);

      if (error) throw error;

      // ローカル状態を即座に更新（即時UI反映のため）
      setTransaction(prev => prev ? {
        ...prev,
        meetup_time_slots: [],
        meetup_locations: [],
        final_meetup_time: null,
        final_meetup_location: null,
        status: nextStatus,
        schedule_change_requested_by: null,
        previous_final_meetup_time: null,
        previous_final_meetup_location: null,
      } : prev);

      const hasAskedRescheduleBefore = messages.some((message) =>
        message.message.includes("現在の候補日程をいったん取り下げました") ||
        message.message.includes("提案いただいた日時では対応できません")
      );

      await handleSend(
        hasAskedRescheduleBefore
          ? "すみません、、提案いただいた日時では対応できません。他の日程を探させてください。\n\n日程変更、登録から日程を選択してください。"
          : "現在の候補日程をいったん取り下げました。再度、行けそうな日程候補を提案します。"
      );
      setIsScheduleModalOpen(true);
    } catch (err: any) {
      alert("再調整の処理に失敗しました: " + err.message);
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleCompleteTransaction = async () => {
    if (isFinalizing || !item || !transaction || !user) return;
    if (user.id !== transaction.buyer_id && user.id !== transaction.seller_id) return;
    if (!['accepted', 'scheduling', 'scheduled', 'pending', 'confirmed'].includes(transaction.status)) return;
    setIsFinalizing(true);
    try {
      const isBuyer = user.id === transaction.buyer_id;
      const updateField = isBuyer ? 'buyer_completed' : 'seller_completed';
      const otherField = isBuyer ? 'seller_completed' : 'buyer_completed';

      // Update current user's completion status
      const { data: updatedTx, error: txError } = await (supabase.from("transactions") as any)
        .update({ [updateField]: true })
        .eq("id", transaction.id)
        .select()
        .single();

      if (txError) throw txError;

      // Check if both parties have completed
      const bothCompleted = updatedTx[otherField] === true;

      if (bothCompleted) {
        // Both completed - mark transaction as awaiting_rating (will be completed after both rate)
        const { error: statusError } = await (supabase.from("transactions") as any)
          .update({ status: 'awaiting_rating' })
          .eq("id", transaction.id);
        if (statusError) throw statusError;
      } else {
        // Only current user completed - mark as awaiting_rating
        const { error: statusError } = await (supabase.from("transactions") as any)
          .update({ status: 'awaiting_rating' })
          .eq("id", transaction.id);
        if (statusError) throw statusError;
      }

      // Always redirect to rating page
      router.push(`/rating/${transaction.id}`);
    } catch (err: any) {
      alert("取引の完了に失敗しました: " + err.message);
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleCancelTransaction = async (reason: string) => {
    if (isFinalizing || !item || !transaction || !user) return;
    if (user.id !== transaction.buyer_id && user.id !== transaction.seller_id) return;
    if (!['requested', 'pending_approval', 'accepted', 'scheduling', 'scheduled', 'pending', 'confirmed'].includes(transaction.status)) return;
    setIsFinalizing(true);
    try {
      const { error } = await (supabase as any).rpc("cancel_consultation_and_reopen_item", {
        target_transaction_id: transaction.id,
        reason,
      });
      if (error) throw error;

      // Redirect to home
      router.push('/');
    } catch (err: any) {
      alert("取引のキャンセルに失敗しました: " + err.message);
    } finally {
      setIsFinalizing(false);
      setIsCancellationReasonModalOpen(false);
      setIsCancellationModalOpen(false);
    }
  };

  const ownChatAvatar = useMemo(() => (
    <RewardAvatar
      src={avatarUrl}
      alt="avatar"
      size={40}
      listingCount={ownAvatarReward.listingCount}
      earlyRegistration={ownAvatarReward.earlyRegistration}
    />
  ), [avatarUrl, ownAvatarReward.earlyRegistration, ownAvatarReward.listingCount]);

  const otherChatAvatar = useMemo(() => {
    const avatar = (
      <RewardAvatar
        src={otherUserProfile?.avatar_url || null}
        alt="avatar"
        size={40}
        listingCount={otherUserProfile?.listing_count ?? 0}
        earlyRegistration={otherUserProfile?.early_registration}
      />
    );

    if (!otherUserId || otherUserProfile?.is_deactivated) {
      return avatar;
    }

    return (
      <Link
        href={`/seller/${otherUserId}`}
        className="block rounded-full transition-transform active:scale-95"
        aria-label="相手の情報を見る"
      >
        {avatar}
      </Link>
    );
  }, [
    otherUserId,
    otherUserProfile?.avatar_url,
    otherUserProfile?.early_registration,
    otherUserProfile?.is_deactivated,
    otherUserProfile?.listing_count,
  ]);

  if (authLoading || loading) {
    return (
      <div className="h-screen bg-gray-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
          <p className="text-white">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">このチャットにアクセスする権限がありません</p>
          <Link href="/" className="text-primary hover:underline">
            ホームに戻る
          </Link>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">商品が見つかりませんでした</p>
          <Link href="/" className="text-primary hover:underline">
            ホームに戻る
          </Link>
        </div>
      </div>
    );
  }

  const transactionStatusLabel = {
    requested: "相談中",
    pending_approval: "相談中",
    accepted: "相談中",
    scheduling: "相談中",
    scheduled: "予定確定済み",
    awaiting_rating: "評価待ち",
    completed: "取引完了",
    cancelled: "キャンセル済み",
    rejected: "辞退済み",
    declined: "辞退済み",
    expired: "期限切れ",
    auto_closed: "終了済み",
  }[transaction?.status || ""];

  const statusLabel = transactionStatusLabel || ({
    available: "出品中",
    transaction_pending: "相談中",
    trading: "相談中",
    awaiting_rating: "評価待ち",
    sold: "取引完了",
  }[item.status] || item.status);

  const isCancelled = transaction?.status === 'cancelled';
  const isAwaitingRating = transaction?.status === 'awaiting_rating';
  const isDeclined = ['rejected', 'declined', 'expired', 'auto_closed'].includes(transaction?.status || '');
  const isClosedTransaction = isCancelled || isDeclined || transaction?.status === 'completed';
  const canUseTradeActions = ['requested', 'pending_approval', 'accepted', 'scheduling', 'scheduled', 'pending', 'confirmed'].includes(transaction?.status || '');
  const canAdjustSchedule = ['requested', 'pending_approval', 'accepted', 'scheduling', 'scheduled', 'pending', 'confirmed'].includes(transaction?.status || '');
  const canCancelTransaction = canUseTradeActions && !isDeclined && transaction?.status !== 'completed' && transaction?.status !== 'cancelled';

  const isSeller = user?.id === item.seller_id;
  const isScheduleChangeRequester = !!transaction?.schedule_change_requested_by && transaction.schedule_change_requested_by === user?.id;
  const canConfirmSchedule = canUseTradeActions && !!transaction && (
    transaction.schedule_change_requested_by
      ? transaction.schedule_change_requested_by !== user?.id
      : isSeller
  );
  const hasScheduleCandidates = !!transaction?.meetup_time_slots?.length && !transaction.final_meetup_time;
  const isScheduleAnswerer = hasScheduleCandidates && canConfirmSchedule;
  const scheduleCandidateTone = isScheduleAnswerer
    ? {
        border: "border-red-200",
        panel: "bg-red-50",
        icon: "bg-red-100 text-red-500",
        label: "text-red-600",
        title: "text-red-950",
        hover: "hover:bg-red-100/70 active:bg-red-100",
        text: "候補日時を確認し回答してください",
      }
    : {
        border: "border-amber-200",
        panel: "bg-amber-50",
        icon: "bg-amber-100 text-amber-600",
        label: "text-amber-700",
        title: "text-amber-950",
        hover: "hover:bg-amber-100/70 active:bg-amber-100",
        text: "候補日時を相手が選択中です",
      };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || start.x > 56) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;

    if (deltaX > 90 && Math.abs(deltaY) < 70) {
      router.push(backHref);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex h-[100dvh] flex-col bg-white overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-md px-4 py-3 flex items-center gap-3 z-50 border-b border-gray-100 h-16">
        <Link href={backHref} className="p-1">
          <ArrowLeft className="w-6 h-6 text-black" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-black font-bold truncate">
            {item.title}
          </h1>
          <p className="text-gray-500 text-xs">
            {otherUserProfile?.is_deactivated ? "相手は退会済みです" : statusLabel}
          </p>
        </div>
      </header>

      {/* Declined Banner */}
      {isDeclined && (
        <div className="fixed top-16 left-0 right-0 bg-red-50/95 backdrop-blur-md px-4 py-3 z-40 border-b border-red-200">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-500" />
            <span className="text-xs font-bold text-red-600">このリクエストは辞退されました</span>
          </div>
          {transaction?.decline_reason && (
            <p className="text-xs text-red-500 mt-1 ml-6">理由: {transaction.decline_reason}</p>
          )}
        </div>
      )}

      {/* Cancelled Banner */}
      {isCancelled && (
        <div className="fixed top-16 left-0 right-0 bg-red-50/95 backdrop-blur-md px-4 py-3 z-40 border-b border-red-200">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-500" />
            <span className="text-xs font-bold text-red-600">この取引はキャンセルされました</span>
          </div>
          {transaction?.cancellation_reason && (
            <p className="text-xs text-red-500 mt-1 ml-6">理由: {transaction.cancellation_reason}</p>
          )}
        </div>
      )}

      {/* Rating Banner */}
      {isAwaitingRating && transaction && (
        <div className="fixed top-16 left-0 right-0 bg-purple-50/95 backdrop-blur-md px-4 py-3 z-40 border-b border-purple-200">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-purple-500 text-white shadow-sm">
              <Star className="h-5 w-5 fill-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-purple-700">取引完了後の評価をお願いします</p>
              <p className="mt-0.5 text-[11px] font-bold text-purple-500">評価が完了すると取引履歴へ移動します。</p>
            </div>
            <button
              onClick={() => router.push(`/rating/${transaction.id}`)}
              className="flex-shrink-0 rounded-xl bg-purple-600 px-4 py-2 text-xs font-black text-white shadow-sm transition-all hover:bg-purple-700 active:scale-[0.98]"
            >
              評価する
            </button>
          </div>
        </div>
      )}

      {/* Action Bar (Below Header) */}
      {canUseTradeActions && !isDeclined && !isCancelled && (
      <div className="fixed top-16 left-0 right-0 bg-white/95 backdrop-blur-md px-3 py-2 z-40 flex gap-1.5 border-b border-gray-100">
        <button
          onClick={() => setIsScheduleModalOpen(true)}
          disabled={transaction?.status === 'awaiting_rating' || transaction?.status === 'completed'}
          className="flex-1 min-w-0 flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 rounded-xl transition-all border border-slate-600 text-[11px] whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Calendar className="w-4 h-4" />
          日程変更・登録
        </button>
        {transaction && canCancelTransaction &&
          !((user?.id === transaction.buyer_id && transaction.buyer_completed) || (user?.id === transaction.seller_id && transaction.seller_completed)) && (
            <button
              onClick={() => setIsCancellationModalOpen(true)}
              className="flex-1 min-w-0 flex items-center justify-center gap-1 bg-amber-400 hover:bg-amber-500 text-amber-950 font-bold py-2 rounded-xl transition-all border border-amber-300 text-[10px] whitespace-nowrap shadow-sm active:scale-[0.98]"
            >
              {isSeller && <RefreshCw className="w-4 h-4" />}
              {isSeller ? "取引相手を変える" : "購入リクエスト取り下げ"}
            </button>
          )}
        <button
          onClick={() => setIsCompletionModalOpen(true)}
          disabled={
            transaction?.status === 'completed' ||
            (user?.id === transaction?.buyer_id && transaction?.buyer_completed) ||
            (user?.id === transaction?.seller_id && transaction?.seller_completed)
          }
          className="flex-1 min-w-0 flex items-center justify-center gap-1.5 bg-primary/80 hover:bg-primary text-white font-bold py-2 rounded-xl transition-all shadow-lg shadow-black/5 text-[11px] whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CheckCircle2 className="w-4 h-4" />
          取引終了
        </button>
      </div>
      )}

      <div className="flex-1 overflow-hidden pt-[116px] flex flex-col">
        {transaction?.final_meetup_time && (
          <div className="flex-shrink-0 bg-white/95 px-4 pb-3 pt-2 backdrop-blur-md">
            <div className="flex items-center gap-3 rounded-2xl border-2 border-green-500/20 bg-green-500/10 p-3 shadow-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-500 text-white shadow-lg shadow-green-500/20">
                <CheckCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-green-600">受け渡し日時</p>
                <p className="truncate text-sm font-black text-green-900">{transaction.final_meetup_time}</p>
                <p className="truncate text-[10px] font-medium text-green-700/70">場所: {transaction.final_meetup_location}</p>
              </div>
            </div>
          </div>
        )}

        {transaction && hasScheduleCandidates && (
          <div className="relative z-30 flex-shrink-0 bg-white/95 px-4 pb-3 pt-2 backdrop-blur-md">
            <div className={`relative rounded-2xl border ${scheduleCandidateTone.border} ${scheduleCandidateTone.panel} shadow-sm`}>
              <button
                type="button"
                onClick={() => setIsScheduleCandidatesOpen((current) => !current)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${scheduleCandidateTone.hover}`}
              >
                <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${scheduleCandidateTone.icon}`}>
                  <Calendar className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[10px] font-black uppercase tracking-widest ${scheduleCandidateTone.label}`}>変更候補の確認</p>
                  <p className={`truncate text-sm font-black ${scheduleCandidateTone.title}`}>
                    {isScheduleCandidatesOpen ? "候補から日時を確認できます" : scheduleCandidateTone.text}
                  </p>
                </div>
                <ChevronRight className={`h-5 w-5 flex-shrink-0 text-gray-400 transition-transform ${isScheduleCandidatesOpen ? "rotate-90" : ""}`} />
              </button>

              <div className={`absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-xl shadow-black/10 backdrop-blur-md transition-[max-height,opacity,transform] duration-150 ease-out ${isScheduleCandidatesOpen ? "max-h-[440px] translate-y-0 opacity-100" : "pointer-events-none max-h-0 -translate-y-1 opacity-0"}`}>
                <div className="px-4 pb-4 pt-3">
                  <p className="mb-3 text-xs font-bold leading-relaxed text-gray-600">
                    日程が決まり、こちらに記録していただくと予定管理に反映されます。
                  </p>
                  <p className="mb-3 rounded-xl bg-gray-50 px-3 py-2 text-xs font-bold text-gray-500">
                    {transaction.schedule_change_requested_by
                        ? isScheduleChangeRequester
                          ? "相手が承認するまでお待ちください。候補は以下の内容で提案されています。"
                          : "提案された候補から行けそうな日時を選ぶと、変更が承認されます。"
                        : "募集された候補から都合の良い日時を選択してください。"}
                  </p>

                  <div className="space-y-2">
                    {transaction.meetup_time_slots.map((slot) => {
                      const label = formatTimeSlotLabel(slot);

                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => {
                            if (canConfirmSchedule && !transaction.final_meetup_time) {
                              handleFinalizeSchedule(slot, transaction.meetup_locations[0]);
                            }
                          }}
                          disabled={isFinalizing || !canConfirmSchedule || !!transaction.final_meetup_time}
                          className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition-all disabled:opacity-50 ${canConfirmSchedule && !transaction.final_meetup_time
                            ? "border-primary/25 bg-primary/5 text-primary active:scale-[0.99]"
                            : "border-gray-200 bg-gray-50 text-gray-500"
                            }`}
                        >
                          <span className="text-sm font-black">{label}</span>
                          <Clock className="h-4 w-4 opacity-60" />
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => {
                        if (canAdjustSchedule && !transaction.final_meetup_time) {
                          handleReschedule();
                        }
                      }}
                      disabled={isFinalizing || !canAdjustSchedule || !!transaction.final_meetup_time}
                      className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-center text-xs font-bold text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      再度日程調整をお願いする
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Messages Area */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 py-4"
        >
          <MessageList
            messages={messages}
            currentUserId={user?.id}
            ownAvatar={ownChatAvatar}
            otherAvatar={otherChatAvatar}
            messagesEndRef={messagesEndRef}
          />
        </div>

        {/* Input Area */}
        <div
          className="flex-shrink-0 bg-white px-4 pt-2.5 border-t border-gray-200"
          style={{ paddingBottom: "max(14px, calc(env(safe-area-inset-bottom) + 10px))" }}
        >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isClosedTransaction) return;
            handleSend();
          }}
          className="flex items-center gap-3"
        >
          {/* Image Picker */}
          <label className={`p-2 rounded-full transition-colors relative ${isClosedTransaction ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-gray-100"}`}>
            <input
              type="file"
              accept={ALLOWED_IMAGE_ACCEPT}
              className="hidden"
              onChange={handleImageUpload}
              disabled={isUploadingImage || isClosedTransaction}
            />
            {isUploadingImage ? (
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            ) : (
              <ImageIcon className="w-6 h-6 text-gray-500" />
            )}
          </label>

          <textarea
            ref={inputRef}
            onFocus={() => {
              inputFocusedRef.current = true;
            }}
            onBlur={() => {
              inputFocusedRef.current = false;
            }}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
              lastInputAtRef.current = Date.now();
            }}
            onChange={(e) => {
              lastInputAtRef.current = Date.now();
              resizeMessageInput();
              const hasText = e.target.value.trim().length > 0;
              setHasDraftMessage((current) => current === hasText ? current : hasText);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSend();
              }
            }}
            maxLength={INPUT_LIMITS.chatMessageMax}
            placeholder={isClosedTransaction ? "この取引は終了しています" : "メッセージを入力..."}
            rows={1}
            className="max-h-28 min-h-12 flex-1 resize-none overflow-y-auto rounded-3xl border border-gray-200 bg-gray-100 px-4 py-3 text-[15px] leading-6 focus:outline-none focus:ring-2 focus:ring-primary/50"
            disabled={sending || isClosedTransaction}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={isClosedTransaction || (!hasDraftMessage && !isUploadingImage) || sending}
            className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${(hasDraftMessage || isUploadingImage) && !sending
              ? "bg-primary text-white shadow-md active:scale-95"
              : "bg-gray-200 text-gray-400"
              }`}
          >
            {sending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </form>
        </div>
      </div>

      {/* Schedule Adjustment Modal */}
      <ScheduleAdjustmentModal
        isOpen={isScheduleModalOpen}
        allowRegister={canUseTradeActions}
        onClose={() => setIsScheduleModalOpen(false)}
        onConfirm={async (slots: string[], locations: string[]) => {
          if (!transaction || !user) return;
          setIsFinalizing(true);
          const previousTime = transaction.final_meetup_time;
          const previousLocation = transaction.final_meetup_location;
          const nextStatus = 'scheduling';
          try {
            const { error } = await (supabase.from("transactions") as any)
              .update({
                meetup_time_slots: slots,
                meetup_locations: locations,
                final_meetup_time: null,
                final_meetup_location: null,
                status: nextStatus,
                schedule_change_requested_by: user.id,
                previous_final_meetup_time: previousTime,
              })
              .eq("id", transaction.id);
            if (error) throw error;

            setTransaction(prev => prev ? {
              ...prev,
              meetup_time_slots: slots,
              meetup_locations: locations,
              final_meetup_time: null,
              final_meetup_location: null,
              status: nextStatus,
              schedule_change_requested_by: user.id,
              previous_final_meetup_time: previousTime,
              previous_final_meetup_location: previousLocation,
            } : prev);

            // Send notification message
            const previousSchedule = previousTime
              ? `変更前:\n・日時: ${previousTime}\n・場所: ${previousLocation || "未設定"}`
              : "変更前:\n・まだ受け渡し日時は決まっていません";
            await handleSend(
              `【受け渡し日時の変更提案】\n\n${previousSchedule}\n\n変更後の候補:\n${formatScheduleCandidates(slots, locations)}\n\nこの候補で問題ないか、相手の方はチャット上部の候補から行けそうな日時を選んで承認してください。`
            );
          } catch (err: any) {
            alert("日程の変更に失敗しました: " + err.message);
          } finally {
            setIsFinalizing(false);
            setIsScheduleModalOpen(false);
          }
        }}
        onRegister={async (slot: string, location: string) => {
          if (!transaction || !user || !canUseTradeActions) return;
          setIsFinalizing(true);
          const formattedTime = formatTimeSlotLabel(slot);
          const formattedLocation = formatLocationLabel(location);
          try {
            const { error } = await (supabase.from("transactions") as any)
              .update({
                meetup_time_slots: [slot],
                meetup_locations: [location],
                final_meetup_time: formattedTime,
                final_meetup_location: formattedLocation,
                status: 'scheduled',
                schedule_change_requested_by: null,
                previous_final_meetup_time: null,
                previous_final_meetup_location: null,
              })
              .eq("id", transaction.id);
            if (error) throw error;

            setTransaction(prev => prev ? {
              ...prev,
              meetup_time_slots: [slot],
              meetup_locations: [location],
              final_meetup_time: formattedTime,
              final_meetup_location: formattedLocation,
              status: 'scheduled',
              schedule_change_requested_by: null,
              previous_final_meetup_time: null,
              previous_final_meetup_location: null,
            } : prev);

            await handleSend(`【受け渡し予定が登録されました】\n\n日時: ${formattedTime}\n場所: ${formattedLocation}\n\nこの予定は予定管理に反映されました。`);
          } catch (err: any) {
            alert("日程の登録に失敗しました: " + err.message);
          } finally {
            setIsFinalizing(false);
            setIsScheduleModalOpen(false);
          }
        }}
      />

      {/* Transaction Completion Modal */}
      <CompletionConfirmationModal
        isOpen={isCompletionModalOpen}
        onClose={() => setIsCompletionModalOpen(false)}
        onConfirm={handleCompleteTransaction}
        isSeller={isSeller}
      />

      {/* Transaction Cancellation Confirmation Modal */}
      <CancellationConfirmationModal
        isOpen={isCancellationModalOpen}
        onClose={() => setIsCancellationModalOpen(false)}
        onConfirm={() => {
          setIsCancellationModalOpen(false);
          setIsCancellationReasonModalOpen(true);
        }}
        isSeller={isSeller}
      />

      {/* Cancellation Reason Input Modal */}
      <CancellationReasonModal
        isOpen={isCancellationReasonModalOpen}
        onClose={() => setIsCancellationReasonModalOpen(false)}
        onConfirm={handleCancelTransaction}
        isSubmitting={isFinalizing}
        isSeller={isSeller}
      />

      {/* Decline Reason Modal (for seller declining purchase request) */}
      <DeclineReasonModal
        isOpen={isDeclineModalOpen}
        onClose={() => setIsDeclineModalOpen(false)}
        onConfirm={async (reason: string) => {
          if (!transaction || !item) return;
          setIsApproving(true);
          try {
            const { error } = await (supabase as any).rpc('reject_purchase_request', {
              target_transaction_id: transaction.id,
              reason,
            });
            if (error) throw error;

            // Update local state
            setTransaction(prev => prev ? {
              ...prev,
              status: 'rejected',
              decline_reason: reason,
            } : prev);

            // メール通知APIを非同期で呼び出し
            fetch("/api/notify/transaction", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "decline",
                itemId: item.id,
                receiverId: transaction.buyer_id,
                extraData: { transactionId: transaction.id },
              }),
            }).catch(e => console.error(e));

            setIsDeclineModalOpen(false);
          } catch (err: any) {
            alert('辞退に失敗しました: ' + err.message);
          } finally {
            setIsApproving(false);
          }
        }}
        isSubmitting={isApproving}
      />

      <style jsx global>{`
        .safe-area-bottom {
          padding-bottom: max(12px, env(safe-area-inset-bottom));
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.05);
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}

const MessageList = memo(function MessageList({
  messages,
  currentUserId,
  ownAvatar,
  otherAvatar,
  messagesEndRef,
}: {
  messages: Message[];
  currentUserId?: string;
  ownAvatar: React.ReactNode;
  otherAvatar: React.ReactNode;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}) {
  if (messages.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-white/80 text-sm">
          メッセージを送信して取引を開始しましょう
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((msg, index) => {
        const prevMsg = messages[index - 1];
        const isOwnMessage = msg.sender_id === currentUserId;
        const showAvatar = !prevMsg || prevMsg.sender_id !== msg.sender_id;

        return (
          <MessageRow
            key={msg.id}
            message={msg}
            isOwnMessage={isOwnMessage}
            showAvatar={showAvatar}
            avatar={isOwnMessage ? ownAvatar : otherAvatar}
          />
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
});

const MessageRow = memo(function MessageRow({
  message,
  isOwnMessage,
  showAvatar,
  avatar,
}: {
  message: Message;
  isOwnMessage: boolean;
  showAvatar: boolean;
  avatar: React.ReactNode;
}) {
  return (
    <div className={`flex items-end gap-2 ${isOwnMessage ? "flex-row-reverse" : "flex-row"}`}>
      <div className="flex-shrink-0" style={{ width: 40 }}>
        {showAvatar && avatar}
      </div>

      <div className={`flex max-w-[55%] flex-col ${isOwnMessage ? "items-end" : "items-start"}`}>
        <div
          className={`w-fit min-w-[50px] px-4 py-2.5 rounded-2xl shadow-sm border ${isOwnMessage
            ? "rounded-br-sm bg-sky-50 border-sky-200"
            : "rounded-bl-sm bg-sky-100 border-sky-300"
            }`}
        >
          {message.image_url && (
            <div className="mb-2 -mx-2 -mt-1 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
              <Image
                src={message.image_url}
                alt="添付画像"
                width={300}
                height={300}
                className="w-full h-auto object-cover max-h-[300px] hover:scale-105 transition-transform duration-500 cursor-pointer"
                onClick={() => window.open(message.image_url!, "_blank")}
              />
            </div>
          )}
          <p className="whitespace-pre-wrap break-all text-[15px] leading-relaxed text-slate-800 font-medium">
            {message.message}
          </p>
        </div>

        {isOwnMessage && (
          <div className="flex items-center gap-1 mt-1 mr-1">
            {message.is_read ? (
              <span className="text-[10px] text-blue-200 flex items-center gap-0.5">
                <CheckCheck className="w-3 h-3" />
                既読
              </span>
            ) : (
              <span className="text-[10px] text-white/50 flex items-center gap-0.5">
                <Check className="w-3 h-3" />
                送信済み
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

// --- Sub-components for Schedule Adjustment ---

const TIME_SLOTS = [
  { id: "12period", label: "12限終わり休み" },
  { id: "lunch", label: "お昼休み" },
  { id: "56period", label: "56限終わり休み" },
  { id: "78period", label: "78限終わり休み" },
  { id: "other", label: "その他" },
];

const LOCATIONS = [
  { id: "library", label: "図書館前" },
  { id: "taki_plaza", label: "タキプラザ一階" },
  { id: "seven_eleven", label: "セブンイレブン前" },
  { id: "other", label: "その他（チャットで相談）" },
];

const getNext7Days = () => {
  const days = [];
  const today = new Date();
  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];

  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayOfWeek = date.getDay();
    const dayName = dayNames[dayOfWeek];
    days.push({
      id: date.toISOString().split("T")[0],
      label: `${month}/${day}(${dayName})`,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    });
  }
  return days;
};

function ScheduleAdjustmentModal({
  isOpen,
  onClose,
  onConfirm,
  allowRegister = false,
  onRegister,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (slots: string[], locations: string[]) => Promise<void>;
  allowRegister?: boolean;
  onRegister?: (slot: string, location: string) => Promise<void>;
}) {
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [expandedDays, setExpandedDays] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<"propose" | "register">("propose");

  const days = useMemo(() => getNext7Days(), []);

  useEffect(() => {
    if (!isOpen) return;
    setMode("propose");
    setSelectedTimeSlots([]);
    setSelectedLocations([]);
    setExpandedDays([]);
  }, [isOpen]);

  const toggleTimeSlot = (dateId: string, slotId: string) => {
    const key = `${dateId}_${slotId}`;
    setSelectedTimeSlots((prev) =>
      prev.includes(key)
        ? prev.filter((s) => s !== key)
        : mode === "register"
          ? [key]
          : [...prev, key]
    );
  };

  const toggleLocation = (locationId: string) => {
    setSelectedLocations((prev) =>
      prev.includes(locationId)
        ? prev.filter((l) => l !== locationId)
        : mode === "register"
          ? [locationId]
          : [...prev, locationId]
    );
  };

  const toggleDay = (dayId: string) => {
    setExpandedDays((prev) =>
      prev.includes(dayId)
        ? prev.filter((d) => d !== dayId)
        : [...prev, dayId]
    );
  };

  const isRegisterMode = allowRegister && mode === "register";
  const isValid = selectedTimeSlots.length > 0 && selectedLocations.length > 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white w-full max-w-lg h-[80vh] overflow-hidden rounded-t-[32px] sm:rounded-[24px] shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b flex items-center justify-between bg-white">
          <div>
            <h2 className="text-xl font-black text-gray-900">日程の変更・登録</h2>
            <p className="text-xs text-gray-500 font-bold mt-1">
              {isRegisterMode ? "確定する日時と場所を1つずつ選択してください" : "改めて候補を選択してください"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <XIcon className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        {allowRegister && (
          <div className="px-6 pt-4">
            <div className="grid grid-cols-2 rounded-2xl bg-gray-100 p-1">
              <button
                onClick={() => setMode("propose")}
                className={`rounded-xl py-2 text-xs font-black transition-all ${mode === "propose" ? "bg-white text-primary shadow-sm" : "text-gray-500"}`}
              >
                候補を提案
              </button>
              <button
                onClick={() => {
                  setMode("register");
                  setSelectedTimeSlots(prev => prev.slice(0, 1));
                  setSelectedLocations(prev => prev.slice(0, 1));
                }}
                className={`rounded-xl py-2 text-xs font-black transition-all ${mode === "register" ? "bg-white text-primary shadow-sm" : "text-gray-500"}`}
              >
                予定を登録
              </button>
            </div>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-8 space-y-8 custom-scrollbar pb-32">
          {/* 日程選択 */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                <Calendar className="w-4 h-4 text-primary" />
              </div>
              <h3 className="text-sm font-black text-gray-700 uppercase tracking-wider">受け渡し可能日程</h3>
            </div>
            <div className="space-y-3">
              {days.map((day: any) => {
                const isExpanded = expandedDays.includes(day.id);
                const selectedInDay = selectedTimeSlots.filter(s => s.startsWith(day.id)).length;

                return (
                  <div key={day.id} className="border border-gray-100 rounded-2xl overflow-hidden bg-white shadow-sm transition-all hover:shadow-md">
                    <button
                      onClick={() => toggleDay(day.id)}
                      className={`w-full px-5 py-4 flex items-center justify-between transition-colors ${isExpanded ? "bg-primary/5" : "hover:bg-gray-50"}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`font-black ${day.isWeekend ? "text-red-500" : "text-gray-900"}`}>{day.label}</span>
                        {selectedInDay > 0 && (
                          <span className="bg-primary text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                            {selectedInDay}スロット選択中
                          </span>
                        )}
                      </div>
                      <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${isExpanded ? "rotate-90" : ""}`} />
                    </button>

                    {isExpanded && (
                      <div className="p-4 bg-gray-50/50 border-t border-gray-100 grid grid-cols-2 gap-2 animate-in fade-in slide-in-from-top-2">
                        {TIME_SLOTS.map((slot) => {
                          const isSelected = selectedTimeSlots.includes(`${day.id}_${slot.id}`);
                          return (
                            <button
                              key={slot.id}
                              onClick={() => toggleTimeSlot(day.id, slot.id)}
                              className={`px-3 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border-2 ${isSelected
                                ? "bg-primary text-white border-primary shadow-lg shadow-primary/20 scale-[0.98]"
                                : "bg-white text-gray-500 border-gray-100 hover:border-primary/20 hover:text-primary"
                                }`}
                            >
                              {slot.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* 場所選択 */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                <MapPin className="w-4 h-4 text-primary" />
              </div>
              <h3 className="text-sm font-black text-gray-700 uppercase tracking-wider">受け渡し場所</h3>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {LOCATIONS.map((location) => {
                const isSelected = selectedLocations.includes(location.id);
                return (
                  <button
                    key={location.id}
                    onClick={() => toggleLocation(location.id)}
                    className={`px-5 py-4 rounded-2xl text-sm font-bold transition-all text-left flex items-center justify-between border-2 ${isSelected
                      ? "bg-primary/5 text-primary border-primary shadow-sm"
                      : "bg-white text-gray-500 border-gray-100 hover:border-primary/20"
                      }`}
                  >
                    {location.label}
                    {isSelected && <Check className="w-5 h-5" />}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Action Button */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-white/80 backdrop-blur-xl border-t border-gray-100">
          <button
            onClick={() => {
              if (isSubmitting) return;
              setIsSubmitting(true);
              const action = isRegisterMode && onRegister
                ? onRegister(selectedTimeSlots[0], selectedLocations[0])
                : onConfirm(selectedTimeSlots, selectedLocations);
              action.finally(() => setIsSubmitting(false));
            }}
            disabled={!isValid || isSubmitting}
            className={`w-full py-4 rounded-2xl font-black text-white shadow-xl transition-all flex items-center justify-center gap-2 ${isValid && !isSubmitting
              ? "bg-primary hover:bg-primary/90 active:scale-[0.98] shadow-primary/30"
              : "bg-gray-300 shadow-none cursor-not-allowed"
              }`}
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                {isRegisterMode ? "予定を登録する" : "候補を提案する"}
                <Send className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Transaction Completion Modal ---
function CompletionConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  isSeller
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSeller: boolean;
}) {
  const [confirmed, setConfirmed] = useState(false);

  // Reset on open
  useEffect(() => {
    if (isOpen) setConfirmed(false);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 animate-in fade-in duration-300">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-5 duration-300">
        <div className="p-8">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 mx-auto">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>

          <h2 className="text-xl font-black text-gray-900 text-center mb-2">
            受け渡し確認
          </h2>
          <p className="text-gray-500 text-sm text-center mb-6 font-medium">
            商品の受け渡しは完了しましたか？
          </p>

          <div className="space-y-3 mb-6">
            <div className="flex items-start gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <div className="w-5 h-5 mt-0.5 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                <Check className="w-3 h-3 text-white" strokeWidth={4} />
              </div>
              <p className="text-sm font-bold text-gray-700">
                {isSeller ? "代金を受け取りましたか？" : "商品を受け取りましたか？"}
              </p>
            </div>
            <div className="flex items-start gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <div className="w-5 h-5 mt-0.5 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                <Check className="w-3 h-3 text-white" strokeWidth={4} />
              </div>
              <p className="text-sm font-bold text-gray-700">
                {isSeller ? "商品を渡しましたか？" : "代金を支払いましたか？"}
              </p>
            </div>
          </div>

          {/* 警告 */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-3 mb-6">
            <p className="text-xs font-bold text-yellow-700 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              この操作は取り消せません。受け渡しが完了してから押してください。
            </p>
          </div>

          {/* 確認チェックボックス */}
          <button
            onClick={() => setConfirmed(!confirmed)}
            className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all mb-6 ${
              confirmed
                ? "border-primary bg-primary/5"
                : "border-gray-200 bg-white"
            }`}
          >
            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
              confirmed ? "bg-primary border-primary" : "bg-white border-gray-300"
            }`}>
              {confirmed && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
            </div>
            <span className={`text-sm font-bold ${confirmed ? "text-primary" : "text-gray-500"}`}>
              受け渡しが完了したことを確認しました
            </span>
          </button>

          <div className="space-y-3">
            <button
              onClick={onConfirm}
              disabled={!confirmed}
              className={`w-full py-4 rounded-2xl font-black shadow-lg transition-all active:scale-[0.98] ${
                confirmed
                  ? "bg-primary text-white shadow-primary/20 hover:bg-primary/90"
                  : "bg-gray-100 text-gray-400 shadow-none cursor-not-allowed"
              }`}
            >
              取引終了して評価へ
            </button>
            <button
              onClick={onClose}
              className="w-full bg-gray-200 text-gray-700 py-4 rounded-2xl font-black hover:bg-gray-300 transition-all active:scale-[0.98]"
            >
              チャットに戻る
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Consultation Cancellation Confirmation Modal ---
function CancellationConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  isSeller,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSeller: boolean;
}) {
  if (!isOpen) return null;

  const copy = isSeller
    ? {
        title: "この取引を終了して再公開しますか？",
        confirm: "理由を選択する",
        lines: [
          "現在の購入希望者との取引を終了し、この商品を再び他の人も購入リクエストできる状態にします。",
          "入力した理由は相手にも表示されます。相手が不当だと感じた場合は、運営へお問い合わせもできます。",
        ],
      }
    : {
        title: "購入リクエストを取り下げますか？",
        confirm: "理由を選択する",
        lines: [
          "この商品の購入リクエストを取り下げます。",
          "取り下げると、出品者との相談は終了し、この商品は再び他の人も購入リクエストできる状態になります。",
          "入力した理由は相手にも表示されます。相手が不当だと感じた場合は、運営へお問い合わせもできます。",
        ],
      };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 animate-in fade-in duration-300">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-5 duration-300">
        <div className="p-8">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6 mx-auto">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>

          <h2 className="text-xl font-black text-gray-900 text-center mb-2">
            {copy.title}
          </h2>
          <p className="text-gray-500 text-sm text-center mb-8 font-medium">
            以下の内容を確認してください
          </p>

          <div className="space-y-4 mb-8">
            {copy.lines.map((line) => (
              <div key={line} className="flex items-start gap-3 bg-amber-50 p-4 rounded-2xl border border-amber-100">
                <div className="w-5 h-5 mt-0.5 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-3 h-3 text-white" strokeWidth={4} />
                </div>
                <p className="text-sm font-bold leading-relaxed text-gray-700">
                  {line}
                </p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <button
              onClick={onConfirm}
              className="w-full bg-amber-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-amber-500/20 hover:bg-amber-600 transition-all active:scale-[0.98]"
            >
              {copy.confirm}
            </button>
            <button
              onClick={onClose}
              className="w-full bg-gray-100 text-gray-400 py-4 rounded-2xl font-black hover:bg-gray-200 transition-all active:scale-[0.98]"
            >
              チャットに戻る
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Reopen Item Reason Modal ---
function CancellationReasonModal({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
  isSeller,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isSubmitting: boolean;
  isSeller: boolean;
}) {
  const sellerReasons = [
    "受け渡し日時が合わなかった",
    "受け渡し場所が合わなかった",
    "相手からの返信がない",
    "取引条件が合わなかった",
    "その他",
  ];
  const buyerReasons = [
    "受け渡し日時が合わなかった",
    "受け渡し場所が合わなかった",
    "購入の必要がなくなった",
    "商品の状態や条件が合わなかった",
    "相手からの返信がない",
    "その他",
  ];
  const reasons = isSeller ? sellerReasons : buyerReasons;
  const [selectedReason, setSelectedReason] = useState("");
  const [otherReason, setOtherReason] = useState("");

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!selectedReason) {
      alert("理由を選択してください");
      return;
    }
    if (selectedReason === "その他" && otherReason.trim().length < 3) {
      alert("その他の理由を入力してください");
      return;
    }

    const reason = selectedReason === "その他"
      ? `その他: ${otherReason.trim()}`
      : selectedReason;
    onConfirm(reason);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 animate-in fade-in duration-300">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-5 duration-300">
        <div className="p-8">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6 mx-auto">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>

          <h2 className="text-xl font-black text-gray-900 text-center mb-2">
            {isSeller ? "取引を終了する理由" : "リクエスト取り下げの理由"}
          </h2>
          <p className="text-gray-500 text-sm text-center mb-6 font-medium">
            選択した理由は相手にも表示されます
          </p>

          <div className="mb-6 space-y-2">
            {reasons.map((reason) => (
              <button
                key={reason}
                type="button"
                onClick={() => setSelectedReason(reason)}
                disabled={isSubmitting}
                className={`flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-sm font-bold transition-all active:scale-[0.99] disabled:opacity-50 ${
                  selectedReason === reason
                    ? "border-amber-400 bg-amber-50 text-amber-950"
                    : "border-gray-100 bg-gray-50 text-gray-600 hover:border-amber-200"
                }`}
              >
                <span className={`h-4 w-4 rounded-full border-2 ${
                  selectedReason === reason ? "border-amber-500 bg-amber-500" : "border-gray-300"
                }`} />
                {reason}
              </button>
            ))}

            {selectedReason === "その他" && (
              <textarea
                value={otherReason}
                onChange={(e) => setOtherReason(e.target.value)}
                placeholder="理由を入力してください"
                disabled={isSubmitting}
                className="mt-3 h-28 w-full resize-none rounded-2xl border-2 border-gray-100 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 transition-all placeholder:text-gray-400 focus:border-amber-400 focus:bg-white focus:outline-none"
                maxLength={300}
              />
            )}
          </div>

          <div className="space-y-3">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !selectedReason || (selectedReason === "その他" && otherReason.trim().length < 3)}
              className="w-full bg-amber-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-amber-500/20 hover:bg-amber-600 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                isSeller ? "取引を終了して再公開する" : "リクエストを取り下げる"
              )}
            </button>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="w-full bg-gray-200 text-gray-700 py-4 rounded-2xl font-black hover:bg-gray-300 transition-all active:scale-[0.98] disabled:opacity-50 disabled:text-gray-400"
            >
              戻る
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Decline Reason Modal (for seller to decline purchase request) ---
function DeclineReasonModal({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isSubmitting: boolean;
}) {
  const [reason, setReason] = useState("");

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!reason.trim()) {
      alert("辞退理由を入力してください");
      return;
    }
    onConfirm(reason.trim());
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 animate-in fade-in duration-300">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-5 duration-300">
        <div className="p-8">
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mb-6 mx-auto">
            <XCircle className="w-8 h-8 text-amber-500" />
          </div>

          <h2 className="text-xl font-black text-gray-900 text-center mb-2">
            リクエストを辞退
          </h2>
          <p className="text-gray-500 text-sm text-center mb-6 font-medium">
            購入者への配慮のため、辞退理由を入力してください
          </p>

          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例: 先に約束していた方がいるため辞退させていただきます"
            disabled={isSubmitting}
            className="w-full h-32 px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:outline-none focus:border-amber-500 focus:bg-white transition-all resize-none text-gray-700 placeholder:text-gray-400 font-medium mb-4"
            maxLength={300}
          />

          <div className="flex items-start gap-3 bg-red-50 p-3 rounded-xl border border-red-100 mb-6">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs font-bold text-red-600">
              この操作は取り消せません。辞退するとリクエストはキャンセルされます。
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !reason.trim()}
              className="w-full bg-red-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "辞退を確定する"
              )}
            </button>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="w-full bg-gray-100 text-gray-400 py-4 rounded-2xl font-black hover:bg-gray-200 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
