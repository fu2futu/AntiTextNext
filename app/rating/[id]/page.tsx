"use client";

import { useState, useEffect } from "react";
import { Star, Loader2, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";

export default function RatingPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { user, isAppReviewDemo } = useAuth();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [transaction, setTransaction] = useState<any | null>(null);
  const [ratedUser, setRatedUser] = useState<any | null>(null);
  const [alreadyRated, setAlreadyRated] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!user) return;
      try {
        const { data: tx, error: txError } = await supabase
          .from("transactions")
          .select("*, items(*)")
          .eq("id", params.id)
          .single();

        if (txError) throw txError;
        const typedTx = tx as any;
        const isParticipant = typedTx.buyer_id === user.id || typedTx.seller_id === user.id;
        if (!isParticipant || typedTx.status !== "awaiting_rating" || (isAppReviewDemo && typedTx.is_demo !== true)) {
          router.push("/transactions");
          return;
        }
        setTransaction(tx);

        // Determine who to rate (if I am buyer, rate seller. if I am seller, rate buyer)
        const ratedUserId = typedTx.buyer_id === user.id ? typedTx.seller_id : typedTx.buyer_id;
        
        const { data: profile, error: pError } = await supabase
          .from("profiles")
          .select("*")
          .eq("user_id", ratedUserId)
          .single();
        
        if (pError) throw pError;
        setRatedUser(profile);

        // Check if user has already rated
        const { data: existingRating } = await supabase
          .from("ratings")
          .select("*")
          .eq("transaction_id", params.id)
          .eq("rater_id", user.id)
          .single();

        if (existingRating) {
          setAlreadyRated(true);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user, params.id, isAppReviewDemo, router]);

  const handleSubmit = async () => {
    if (submitting || alreadyRated || !user || !transaction || !ratedUser || rating === 0) return;
    const isParticipant = transaction.buyer_id === user.id || transaction.seller_id === user.id;
    const expectedRatedUserId = transaction.buyer_id === user.id ? transaction.seller_id : transaction.buyer_id;
    if (!isParticipant || transaction.status !== "awaiting_rating" || ratedUser.user_id !== expectedRatedUserId || (isAppReviewDemo && transaction.is_demo !== true)) {
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await (supabase as any).rpc("submit_transaction_rating", {
        target_transaction_id: transaction.id,
        score_value: rating,
        comment_text: comment,
      });

      if (error) throw error;

      // 相手に評価完了の通知（催促）を送信
      fetch("/api/notify/transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rating_remind",
          itemId: transaction.item_id,
          receiverId: ratedUser.user_id,
          extraData: { transactionId: transaction.id }
        }),
      }).catch(e => console.error(e));

      router.push("/profile");
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  if (alreadyRated) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-blue-100">
        <header className="px-6 pt-12 pb-6">
          <h1 className="text-4xl font-black text-primary tracking-tighter">
            TextNext
          </h1>
        </header>

        <div className="px-6 py-8 flex flex-col items-center">
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 className="w-12 h-12 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            評価が完了しました
          </h2>
          <p className="text-gray-600 text-center mb-8 max-w-md">
            取引相手の評価を待っています。双方が評価を完了すると、取引が完全に終了します。
          </p>
          <button
            onClick={() => router.push("/profile")}
            className="bg-primary text-white py-4 px-8 rounded-2xl text-lg font-bold shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all"
          >
            マイページに戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-blue-100">
      <header className="px-6 pt-12 pb-6">
        <h1 className="text-4xl font-black text-primary tracking-tighter">
          TextNext
        </h1>
      </header>

      <div className="px-6 py-8 flex flex-col items-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-8">
          取引が完了しました
        </h2>

        {/* User Info Card */}
        <div className="mb-10 w-full max-w-md bg-white/50 backdrop-blur-md rounded-3xl p-6 border border-white shadow-xl flex flex-col items-center">
          <div className="w-24 h-24 rounded-full border-4 border-primary/20 overflow-hidden mb-4">
             {ratedUser?.avatar_url ? (
               <Image src={ratedUser.avatar_url} alt="User" width={96} height={96} className="w-full h-full object-cover" />
             ) : (
               <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                 <span className="text-4xl">👤</span>
               </div>
             )}
          </div>
          <span className="text-xl font-bold text-gray-900">{ratedUser?.nickname} さん</span>
          <p className="text-sm text-gray-500 mt-1">評価をお願いします</p>
        </div>

        {/* Star Rating Section */}
        <div className="bg-white rounded-[2rem] p-10 mb-10 w-full max-w-md shadow-2xl shadow-blue-200/50 border border-gray-100">
          <div className="flex justify-center gap-3 mb-10">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                className="transition-transform hover:scale-125 active:scale-90"
              >
                <Star
                  className={`w-12 h-12 transition-all duration-300 ${
                    star <= (hoveredRating || rating)
                      ? "fill-yellow-400 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]"
                      : "fill-gray-100 text-gray-200"
                  }`}
                />
              </button>
            ))}
          </div>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="取引の感想を教えてください（任意）"
            className="w-full h-32 px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:outline-none focus:border-primary focus:bg-white transition-all resize-none text-gray-700 placeholder:text-gray-400 font-medium"
          />
        </div>

        {/* Action Button */}
        <button
          onClick={handleSubmit}
          disabled={rating === 0 || submitting}
          className="w-full max-w-md bg-primary text-white py-5 rounded-2xl text-xl font-bold shadow-xl shadow-primary/20 hover:bg-primary/90 hover:-translate-y-1 active:translate-y-0 transition-all disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-3"
        >
          {submitting ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            "評価を送信する"
          )}
        </button>
      </div>
    </div>
  );
}
