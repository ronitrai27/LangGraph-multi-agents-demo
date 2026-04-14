# fake_db.py — in-memory store. All mutations happen on these dicts at runtime.

ORDERS: dict = {
    "ORD-001": {
        "id": "ORD-001",
        "customer_id": "CUST-1",
        "product": "MacBook Pro 14",
        "status": "shipped",
        "amount": 2499.99,
        "date": "2025-04-01",
    },
    "ORD-002": {
        "id": "ORD-002",
        "customer_id": "CUST-1",
        "product": "AirPods Pro 2",
        "status": "delivered",
        "amount": 249.99,
        "date": "2025-03-25",
    },
    "ORD-003": {
        "id": "ORD-003",
        "customer_id": "CUST-2",
        "product": "iPhone 16 Pro",
        "status": "processing",
        "amount": 1199.99,
        "date": "2025-04-10",
    },
    "ORD-004": {
        "id": "ORD-004",
        "customer_id": "CUST-2",
        "product": "iPad Air M2",
        "status": "delivered",
        "amount": 749.99,
        "date": "2025-03-15",
    },
    "ORD-005": {
        "id": "ORD-005",
        "customer_id": "CUST-3",
        "product": "Apple Watch Ultra 2",
        "status": "delivered",
        "amount": 799.99,
        "date": "2025-02-20",
    },
}

CUSTOMERS: dict = {
    "CUST-1": {
        "id": "CUST-1",
        "name": "Alice Johnson",
        "email": "alice@example.com",
        "tier": "premium",
    },
    "CUST-2": {
        "id": "CUST-2",
        "name": "Bob Smith",
        "email": "bob@example.com",
        "tier": "standard",
    },
    "CUST-3": {
        "id": "CUST-3",
        "name": "Charlie Lee",
        "email": "charlie@example.com",
        "tier": "premium",
    },
}

# Refunds are created at runtime
REFUNDS: dict = {}