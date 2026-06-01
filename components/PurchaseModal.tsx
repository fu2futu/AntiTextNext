import { useState, useEffect, useMemo } from "react";
import { X, Banknote, MessageCircleQuestion, Clock, AlertCircle, MapPin, CalendarCheck2, CheckCircle } from "lucide-react";
import { PurchaseData } from "./purchase-utils";
import { PURCHASE_NOTICE_ITEMS } from "@/lib/legal";

type PurchaseModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: PurchaseData) => void;
    itemTitle: string;
    lockedUntil: string | null;
};

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

// ▼▼▼ ここを修正しました ▼▼▼
const getNext7Days = () => {
    const days = [];
    const today = new Date();
    const dayNames = ["日", "月", "火", "水", "木", "金", "土"];

    // 今日から7日間ループして確認
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);

        const dayOfWeek = date.getDay(); // 0:日, 1:月 ... 6:土

        // 土曜日(6) または 日曜日(0) ならリストに追加せずスキップ
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            continue;
        }

        const month = date.getMonth() + 1;
        const day = date.getDate();
        const dayName = dayNames[dayOfWeek];
        
        days.push({
            id: date.toISOString().split("T")[0],
            label: `${month}/${day}(${dayName})`,
            isWeekend: false, // 平日のみ表示するため常にfalseとします
        });
    }
    return days;
};
// ▲▲▲ 修正ここまで ▲▲▲

export default function PurchaseModal({
    isOpen,
    onClose,
    onSubmit,
    itemTitle,
    lockedUntil,
}: PurchaseModalProps) {
    const [paymentMethod, setPaymentMethod] = useState<"cash" | "other">("other");
    const [selectedTimeSlots, setSelectedTimeSlots] = useState<string[]>([]);
    const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
    const [expandedDays, setExpandedDays] = useState<string[]>([]);
    const [timeLeft, setTimeLeft] = useState<string>("");
    const [purchaseNoticeConfirmed, setPurchaseNoticeConfirmed] = useState(false);

    const distinctDaysCount = useMemo(() => {
        return new Set(selectedTimeSlots.map(slot => slot.split('_')[0])).size;
    }, [selectedTimeSlots]);

    const isValid = distinctDaysCount >= 2 && selectedLocations.length > 0;
    const canSubmit = isValid && purchaseNoticeConfirmed;

    // Timer logic
    useEffect(() => {
        if (!isOpen || !lockedUntil) return;

        const interval = setInterval(() => {
            const now = new Date().getTime();
            const end = new Date(lockedUntil).getTime();
            const diff = end - now;

            if (diff <= 0) {
                clearInterval(interval);
                onClose();
                alert("購入権利の有効期限（10分）が切れました。リクエストをキャンセルします。");
                return;
            }

            const minutes = Math.floor(diff / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);
            setTimeLeft(`${minutes}:${seconds.toString().padStart(2, "0")}`);
        }, 1000);

        return () => clearInterval(interval);
    }, [isOpen, lockedUntil, onClose]);

    const days = getNext7Days();

    const toggleTimeSlot = (dateId: string, slotId: string) => {
        const key = `${dateId}_${slotId}`;
        setSelectedTimeSlots((prev) =>
            prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
        );
    };

    const toggleLocation = (locationId: string) => {
        setSelectedLocations((prev) =>
            prev.includes(locationId)
                ? prev.filter((l) => l !== locationId)
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

    const handleSubmit = () => {
        if (!canSubmit) return;

        onSubmit({
            paymentMethod,
            timeSlots: selectedTimeSlots,
            locations: selectedLocations,
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative bg-[#F8F9FA] w-full max-w-lg h-[92vh] sm:h-[85vh] overflow-hidden rounded-t-[40px] sm:rounded-[32px] shadow-2xl animate-in slide-in-from-bottom duration-500 ease-out flex flex-col">
                
                {/* Sticky Header Container */}
                <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-gray-100 shadow-sm">
                    {/* Timer Banner - Pinned at the very top */}
                    <div className="bg-red-500 py-2.5 flex items-center justify-center gap-2.5">
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-white/20 rounded-full">
                            <Clock className="w-3.5 h-3.5 text-white animate-pulse" />
                            <span className="text-[11px] font-black text-white uppercase tracking-tighter">Purchase Rights</span>
                        </div>
                        <span className="text-sm font-black text-white flex items-center gap-2">
                             残り時間：<span className="text-lg tabular-nums leading-none tracking-tight">{timeLeft}</span>
                        </span>
                    </div>

                    {/* Main Header */}
                    <div className="px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                                <CalendarCheck2 className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-gray-900 tracking-tight">購入リクエスト</h2>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{itemTitle}</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-full transition-all active:scale-90"
                        >
                            <X className="w-5 h-5 text-gray-400" />
                        </button>
                    </div>
                </div>

                {/* Scrollable Content Area */}
                <div className="flex-1 overflow-y-auto px-6 py-8 space-y-10 custom-scrollbar pb-48">
                    
                    {/* 支払い方法 */}
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-1.5 h-6 bg-primary rounded-full" />
                            <h3 className="text-lg font-black text-gray-900">お支払い方法</h3>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            <button
                                onClick={() => setPaymentMethod("cash")}
                                className={`flex items-center gap-4 p-5 rounded-3xl border-2 transition-all duration-300 text-left ${
                                    paymentMethod === "cash" 
                                    ? "bg-white border-primary shadow-xl shadow-primary/10 scale-[1.02]" 
                                    : "bg-white border-transparent hover:border-gray-100 grayscale-[0.5] opacity-70"
                                }`}
                            >
                                <div className={`p-4 rounded-2xl transition-colors ${paymentMethod === "cash" ? "bg-green-100" : "bg-gray-100"}`}>
                                    <Banknote className="w-7 h-7 text-green-600" />
                                </div>
                                <div>
                                    <span className="block font-black text-lg text-gray-900 leading-tight">現金手渡し</span>
                                    <span className="text-xs font-bold text-gray-400">対面での決済</span>
                                </div>
                            </button>

                            <button
                                onClick={() => setPaymentMethod("other")}
                                className={`flex items-center gap-4 p-5 rounded-3xl border-2 transition-all duration-300 text-left ${
                                    paymentMethod === "other" 
                                    ? "bg-white border-primary shadow-xl shadow-primary/10 scale-[1.02]" 
                                    : "bg-white border-transparent hover:border-gray-100 grayscale-[0.5] opacity-70"
                                }`}
                            >
                                <div className={`p-4 rounded-2xl transition-colors ${paymentMethod === "other" ? "bg-blue-100" : "bg-gray-100"}`}>
                                    <MessageCircleQuestion className="w-7 h-7 text-blue-500" />
                                </div>
                                <div className="flex-1">
                                    <span className="block font-black text-lg text-gray-900 leading-tight">その他（相談）</span>
                                    <span className="text-xs font-bold text-gray-400">チャットで支払い方法を相談</span>
                                </div>
                            </button>
                        </div>
                    </section>

                    {/* 受け渡し希望日時 */}
                    <section>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-6 bg-primary rounded-full" />
                                <h3 className="text-lg font-black text-gray-900">受け渡し希望日時</h3>
                            </div>
                            <div className="bg-red-50 px-3 py-1.5 rounded-full border border-red-100 flex items-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                                <span className="text-[10px] font-black text-red-600 uppercase tracking-wider">2日以上選択必須</span>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {days.map((day) => (
                                <div key={day.id} className="bg-white rounded-[28px] border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-all duration-300">
                                    <button
                                        onClick={() => toggleDay(day.id)}
                                        className={`w-full flex items-center justify-between p-5 text-left transition-colors ${
                                            day.isWeekend ? "bg-red-50/10" : "bg-white"
                                        }`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`w-12 h-12 rounded-[18px] flex items-center justify-center font-black text-xl shadow-sm ${
                                                day.isWeekend ? "bg-red-500 text-white" : "bg-gray-900 text-white"
                                            }`}>
                                                {day.label.split('(')[0].split('/')[1]}
                                            </div>
                                            <div>
                                                <span className={`block font-black text-lg leading-tight ${day.isWeekend ? "text-red-500" : "text-gray-900"}`}>{day.label}</span>
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                    {day.isWeekend ? "Weekend Priority" : "Weekday Choice"}
                                                </span>
                                            </div>
                                        </div>
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                                            expandedDays.includes(day.id) ? "bg-primary text-white rotate-180" : "bg-gray-50 text-gray-300"
                                        }`}>
                                            <X className={`w-5 h-5 transition-transform ${expandedDays.includes(day.id) ? "rotate-0" : "rotate-45"}`} />
                                        </div>
                                    </button>
                                    
                                    {expandedDays.includes(day.id) && (
                                        <div className="px-5 pb-6 pt-2 grid grid-cols-1 gap-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <div className="h-px bg-gray-50 mb-2" />
                                            <div className="grid grid-cols-2 gap-2.5">
                                                {TIME_SLOTS.filter(slot => !day.isWeekend || slot.id === 'other').map((slot) => {
                                                    const key = `${day.id}_${slot.id}`;
                                                    const isSelected = selectedTimeSlots.includes(key);
                                                    return (
                                                        <button
                                                            key={slot.id}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleTimeSlot(day.id, slot.id);
                                                            }}
                                                            className={`flex items-center gap-3 p-4 rounded-2xl transition-all duration-300 border-2 text-left ${
                                                                isSelected
                                                                    ? "bg-primary/5 border-primary shadow-sm"
                                                                    : "bg-gray-50 border-transparent hover:bg-gray-100"
                                                            }`}
                                                        >
                                                            <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${
                                                                isSelected ? "bg-primary border-primary" : "bg-white border-gray-200"
                                                            }`}>
                                                                {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
                                                            </div>
                                                            <span className={`text-[13px] font-black ${isSelected ? "text-primary" : "text-gray-600"}`}>{slot.label}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* 受け渡し場所 */}
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-1.5 h-6 bg-primary rounded-full" />
                            <h3 className="text-lg font-black text-gray-900">受け渡し場所</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {LOCATIONS.map((location) => {
                                const isSelected = selectedLocations.includes(location.id);
                                return (
                                    <button
                                        key={location.id}
                                        onClick={() => toggleLocation(location.id)}
                                        className={`flex items-center gap-3 p-5 rounded-3xl border-2 transition-all duration-300 text-left bg-white ${
                                            isSelected
                                                ? "border-primary shadow-lg shadow-primary/5 bg-primary/5"
                                                : "border-transparent shadow-sm hover:border-gray-100"
                                        }`}
                                    >
                                        <div className={`p-2.5 rounded-xl ${isSelected ? "bg-primary text-white" : "bg-gray-50 text-gray-400"}`}>
                                            <MapPin className="w-5 h-5" />
                                        </div>
                                        <span className={`text-sm font-black leading-tight ${isSelected ? "text-primary" : "text-gray-900"}`}>
                                            {location.label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    <section className="rounded-3xl border-2 border-red-200 bg-red-50 p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <AlertCircle className="w-5 h-5 text-red-600" />
                            <h3 className="text-base font-black text-red-700">購入前の確認事項</h3>
                        </div>
                        <ul className="space-y-2 text-sm font-medium text-red-900">
                            {PURCHASE_NOTICE_ITEMS.map((item) => (
                                <li key={item} className="flex gap-2">
                                    <span className="font-black">・</span>
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                        <button
                            type="button"
                            onClick={() => setPurchaseNoticeConfirmed(true)}
                            className={`mt-4 w-full rounded-2xl py-3 font-black transition-all flex items-center justify-center gap-2 ${
                                purchaseNoticeConfirmed
                                    ? "bg-green-600 text-white"
                                    : "bg-white text-red-700 border border-red-200 hover:bg-red-100"
                            }`}
                        >
                            <CheckCircle className="w-5 h-5" />
                            {purchaseNoticeConfirmed ? "確認済み" : "確認した"}
                        </button>
                    </section>
                </div>

                {/* Submit Toolbar - Fixed at bottom */}
                <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-gray-100 px-6 py-6 pb-12 sm:pb-8 flex flex-col gap-4 z-[40]">
                    
                    {/* Floating Status Bar */}
                    <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-4">
                             <div className="flex flex-col">
                                <span className={`text-xs font-black uppercase tracking-widest ${distinctDaysCount >= 2 ? "text-green-500" : "text-gray-400"}`}>
                                    必要日数 {distinctDaysCount}/2
                                </span>
                                <div className="w-16 h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                                    <div 
                                        className={`h-full transition-all duration-500 rounded-full ${distinctDaysCount >= 2 ? "bg-green-500" : "bg-primary"}`}
                                        style={{ width: `${Math.min(100, (distinctDaysCount / 2) * 100)}%` }}
                                    />
                                </div>
                             </div>
                             <div className="flex flex-col border-l border-gray-100 pl-4">
                                <span className={`text-xs font-black uppercase tracking-widest ${selectedLocations.length > 0 ? "text-green-500" : "text-gray-400"}`}>
                                    場所選択 {selectedLocations.length > 0 ? "OK" : "未選択"}
                                </span>
                                <div className="w-16 h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                                     <div 
                                        className={`h-full transition-all duration-500 rounded-full ${selectedLocations.length > 0 ? "bg-green-500" : "bg-gray-200"}`}
                                        style={{ width: selectedLocations.length > 0 ? "100%" : "0%" }}
                                    />
                                </div>
                             </div>
                             <div className="flex flex-col border-l border-gray-100 pl-4">
                                <span className={`text-xs font-black uppercase tracking-widest ${purchaseNoticeConfirmed ? "text-green-500" : "text-gray-400"}`}>
                                    注意事項 {purchaseNoticeConfirmed ? "OK" : "未確認"}
                                </span>
                                <div className="w-16 h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                                     <div
                                        className={`h-full transition-all duration-500 rounded-full ${purchaseNoticeConfirmed ? "bg-green-500" : "bg-gray-200"}`}
                                        style={{ width: purchaseNoticeConfirmed ? "100%" : "0%" }}
                                    />
                                </div>
                             </div>
                        </div>
                    </div>

                    <button
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className={`w-full py-5 rounded-[28px] font-black text-lg transition-all transform shadow-2xl active:scale-95 flex items-center justify-center gap-3 ${
                            canSubmit
                            ? "bg-primary text-white shadow-primary/25 hover:bg-primary-dark translate-y-0" 
                            : "bg-gray-100 text-gray-400 cursor-not-allowed translate-y-1 opacity-50 shadow-none border border-gray-200"
                        }`}
                    >
                        <span>購入を確定</span>
                        {canSubmit && <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center animate-bounce-horizontal">→</div>}
                    </button>
                </div>
            </div>
            
            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #E9ECEF;
                    border-radius: 10px;
                }
                @keyframes bounce-horizontal {
                    0%, 100% { transform: translateX(0); }
                    50% { transform: translateX(3px); }
                }
                .animate-bounce-horizontal {
                    animation: bounce-horizontal 1.5s infinite;
                }
            `}</style>
        </div>
    );
}
