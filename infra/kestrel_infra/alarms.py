"""Alarms and the spend guard (P7): every alarm emails the owner through one SNS topic.

Seven CloudWatch alarms (the free tier covers 10) and one AWS Budget:

  queue health   verify DLQ holds a message ; oldest verify message > 60 s
  API            HTTP API 5xx ; API Lambda errors
  verifier       Lambda errors (crash, timeout, out of memory) ; duration > 80% of its timeout
  cost           estimated charges > $10 (us-east-1 only) ; gross spend > 50% of the credits

The verifier reports a failed message in batchItemFailures instead of
raising, so a poison message never shows up as a Lambda error: SQS retries it
and, after 3 receives, moves it to the DLQ, which is what the first alarm
watches. The oldest-message alarm fires sooner, while it is still retrying.
"""

from __future__ import annotations

from aws_cdk import (
    Duration,
    Stack,
    aws_apigatewayv2 as apigw,
    aws_budgets as budgets,
    aws_cloudwatch as cw,
    aws_cloudwatch_actions as cw_actions,
    aws_iam as iam,
    aws_lambda as lambda_,
    aws_sns as sns,
    aws_sns_subscriptions as subs,
    aws_sqs as sqs,
)
from constructs import Construct

OLDEST_MESSAGE_S = 60
API_5XX_PER_5_MIN = 5
VERIFIER_SLOW_FRACTION = 0.8
BILLING_USD = 10
CREDITS_ALERT_PERCENT = 50
# The AWS/Billing metric exists only in us-east-1.
BILLING_REGION = "us-east-1"


def alarm_topic(scope: Construct, email: str | None) -> sns.Topic:
    """The topic every alarm and the budget publish to; the owner confirms the email once."""
    topic = sns.Topic(scope, "Alarms", display_name="Kestrel alarms", enforce_ssl=True)
    if email:
        topic.add_subscription(subs.EmailSubscription(email))
    # A topic with its own policy needs both publishers named; each is held to this account.
    account = Stack.of(scope).account
    for service in ("cloudwatch.amazonaws.com", "budgets.amazonaws.com"):
        topic.add_to_resource_policy(
            iam.PolicyStatement(
                principals=[iam.ServicePrincipal(service)],
                actions=["sns:Publish"],
                resources=[topic.topic_arn],
                conditions={"StringEquals": {"aws:SourceAccount": account}},
            )
        )
    return topic


def add_alarms(
    scope: Construct,
    topic: sns.ITopic,
    *,
    queue: sqs.IQueue,
    dlq: sqs.IQueue,
    http: apigw.HttpApi,
    api_fn: lambda_.IFunction,
    verifier: lambda_.Function | None,
    credits_usd: float,
) -> list[cw.Alarm]:
    action = cw_actions.SnsAction(topic)
    alarms: list[cw.Alarm] = []

    def alarm(id: str, metric: cw.IMetric, threshold: float, description: str) -> None:
        a = metric.create_alarm(
            scope,
            id,
            threshold=threshold,
            evaluation_periods=1,
            comparison_operator=cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            # No data means nothing happened: an idle demo is healthy.
            treat_missing_data=cw.TreatMissingData.NOT_BREACHING,
            alarm_description=description,
        )
        a.add_alarm_action(action)
        alarms.append(a)

    minute, five = Duration.minutes(1), Duration.minutes(5)
    alarm(
        "VerifyDlqNotEmpty",
        dlq.metric_approximate_number_of_messages_visible(period=minute, statistic="Maximum"),
        1,
        "A verify message failed 3 times and is in the dead-letter queue. Read the verifier logs for its messageId.",
    )
    alarm(
        "VerifyQueueStuck",
        queue.metric_approximate_age_of_oldest_message(period=minute, statistic="Maximum"),
        OLDEST_MESSAGE_S,
        f"A verify message has waited over {OLDEST_MESSAGE_S} s: the verifier is failing or not keeping up.",
    )
    alarm(
        "ApiServerErrors",
        http.metric_server_error(period=five, statistic="Sum"),
        API_5XX_PER_5_MIN,
        f"The HTTP API returned {API_5XX_PER_5_MIN}+ 5xx responses in 5 minutes.",
    )
    alarm(
        "ApiFunctionErrors",
        api_fn.metric_errors(period=five, statistic="Sum"),
        1,
        "The API Lambda failed an invocation (crash or timeout).",
    )
    if verifier is not None:
        alarm(
            "VerifierErrors",
            verifier.metric_errors(period=five, statistic="Sum"),
            1,
            "The verifier Lambda crashed, timed out or ran out of memory.",
        )
        timeout_ms = verifier.timeout.to_milliseconds()
        alarm(
            "VerifierSlow",
            verifier.metric_duration(period=five, statistic="Maximum"),
            VERIFIER_SLOW_FRACTION * timeout_ms,
            f"A verification took over {VERIFIER_SLOW_FRACTION:.0%} of the verifier's {timeout_ms // 1000} s timeout.",
        )
    if Stack.of(scope).region == BILLING_REGION:
        alarm(
            "BillingOver10",
            cw.Metric(
                namespace="AWS/Billing",
                metric_name="EstimatedCharges",
                dimensions_map={"Currency": "USD"},
                period=Duration.hours(6),
                statistic="Maximum",
            ),
            BILLING_USD,
            f"This month's estimated AWS charges passed ${BILLING_USD}.",
        )

    # Credits pay the bill, so the bill stays near $0 while they run out. The
    # budget counts spend before credits (IncludeCredit false) over the year.
    budgets.CfnBudget(
        scope,
        "CreditsBudget",
        budget=budgets.CfnBudget.BudgetDataProperty(
            budget_name="kestrel-credits",
            budget_type="COST",
            time_unit="ANNUALLY",
            budget_limit=budgets.CfnBudget.SpendProperty(amount=credits_usd, unit="USD"),
            cost_types=budgets.CfnBudget.CostTypesProperty(include_credit=False, include_refund=False),
        ),
        notifications_with_subscribers=[
            budgets.CfnBudget.NotificationWithSubscribersProperty(
                notification=budgets.CfnBudget.NotificationProperty(
                    notification_type="ACTUAL",
                    comparison_operator="GREATER_THAN",
                    threshold=CREDITS_ALERT_PERCENT,
                    threshold_type="PERCENTAGE",
                ),
                subscribers=[budgets.CfnBudget.SubscriberProperty(subscription_type="SNS", address=topic.topic_arn)],
            )
        ],
    )
    return alarms
