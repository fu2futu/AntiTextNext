import MypageClient from "./client";

export const dynamic = "force-dynamic";

export default function Mypage() {
    return (
        <MypageClient
            initialProfile={null}
            initialListingItems={[]}
            initialPastItems={[]}
            initialFavoriteItems={[]}
            averageRating={0}
            listingCount={0}
            transactionCount={0}
            earlyRegistrationEligible={false}
            badges={[]}
            isAdmin={false}
        />
    );
}
