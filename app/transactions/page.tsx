import TransactionsClient from "./transactions-client";

export const dynamic = "force-dynamic";

export default function TransactionsPage() {
    return (
        <TransactionsClient
            initialActiveItems={[]}
            initialProfile={null}
            initialListingCount={0}
            initialEarlyRegistrationEligible={false}
            serverSession={false}
        />
    );
}
