from pathlib import Path

import aws_cdk as cdk
import pytest
from aws_cdk import aws_ecr_assets as ecr_assets, aws_lambda as lambda_
from aws_cdk.assertions import Template

from kestrel_infra.stack import ANALYTICS_FUNCTION_NAME, KestrelStack

# P7: queue-health, error and cost alarms, all emailed through one topic.
# P8: the nightly analytics Lambda and its schedule.


def synth(tmp: Path, region: str = "us-east-1", **kwargs) -> Template:
    (tmp / "Dockerfile").write_text("FROM public.ecr.aws/lambda/python:3.12\n")

    def image(cmd: str) -> lambda_.DockerImageCode:
        return lambda_.DockerImageCode.from_image_asset(str(tmp), platform=ecr_assets.Platform.LINUX_ARM64, cmd=[cmd])

    stack = KestrelStack(
        cdk.App(),
        "Test",
        api_code=lambda_.Code.from_inline("exports.handler = async () => ({ statusCode: 503 });"),
        verifier_code=image("kestrel_verifier.handler.handler"),
        analytics_code=image("kestrel_analytics.nightly.handler"),
        env=cdk.Environment(region=region),
        **kwargs,
    )
    return Template.from_stack(stack)


@pytest.fixture(scope="module")
def template(tmp_path_factory: pytest.TempPathFactory) -> Template:
    return synth(tmp_path_factory.mktemp("verifier"), alarm_email="owner@example.com", credits_usd=200)


def alarms(template: Template) -> dict[str, dict]:
    return {name: a["Properties"] for name, a in template.find_resources("AWS::CloudWatch::Alarm").items()}


def by_metric(template: Template, metric: str) -> dict:
    (props,) = [p for p in alarms(template).values() if p["MetricName"] == metric]
    return props


def topic(template: Template) -> str:
    (name,) = template.find_resources("AWS::SNS::Topic")
    return name


def test_eight_alarms_fit_the_free_ten_and_all_email_the_topic(template: Template) -> None:
    found = alarms(template)
    assert len(found) == 8
    for props in found.values():
        assert props["AlarmActions"] == [{"Ref": topic(template)}]
        assert props["TreatMissingData"] == "notBreaching"


def test_a_message_in_the_dlq_alarms(template: Template) -> None:
    props = by_metric(template, "ApproximateNumberOfMessagesVisible")
    queues = template.find_resources("AWS::SQS::Queue")
    (dlq,) = [n for n, q in queues.items() if "RedrivePolicy" not in q["Properties"]]
    assert props["Dimensions"] == [{"Name": "QueueName", "Value": {"Fn::GetAtt": [dlq, "QueueName"]}}]
    assert props["Threshold"] == 1 and props["ComparisonOperator"] == "GreaterThanOrEqualToThreshold"


def test_a_verify_message_older_than_60_s_alarms(template: Template) -> None:
    props = by_metric(template, "ApproximateAgeOfOldestMessage")
    assert props["Threshold"] == 60 and props["Period"] == 60


def test_api_5xx_and_both_lambdas_errors_alarm(template: Template) -> None:
    assert by_metric(template, "5xx")["Threshold"] == 5
    errors = [p for p in alarms(template).values() if p["MetricName"] == "Errors"]
    assert len(errors) == 3  # API, verifier, nightly analytics


def test_a_verification_near_its_timeout_alarms(template: Template) -> None:
    props = by_metric(template, "Duration")
    assert props["Threshold"] == 0.8 * 60_000 and props["Statistic"] == "Maximum"


def test_billing_alarm_at_10_usd_only_where_the_metric_exists(template: Template, tmp_path: Path) -> None:
    props = by_metric(template, "EstimatedCharges")
    assert props["Namespace"] == "AWS/Billing" and props["Threshold"] == 10
    elsewhere = synth(tmp_path, region="eu-west-1")
    assert [p["MetricName"] for p in alarms(elsewhere).values()].count("EstimatedCharges") == 0


def test_budget_alerts_at_half_the_credits_counting_spend_before_credits(template: Template) -> None:
    (budget,) = template.find_resources("AWS::Budgets::Budget").values()
    data = budget["Properties"]["Budget"]
    assert data["BudgetLimit"] == {"Amount": 200, "Unit": "USD"}
    assert data["CostTypes"]["IncludeCredit"] is False
    (n,) = budget["Properties"]["NotificationsWithSubscribers"]
    assert n["Notification"]["Threshold"] == 50 and n["Notification"]["ThresholdType"] == "PERCENTAGE"
    assert n["Subscribers"] == [{"SubscriptionType": "SNS", "Address": {"Ref": topic(template)}}]


def test_only_cloudwatch_and_budgets_in_this_account_may_publish(template: Template) -> None:
    (policy,) = template.find_resources("AWS::SNS::TopicPolicy").values()
    publishers = {}
    for st in policy["Properties"]["PolicyDocument"]["Statement"]:
        if st["Effect"] == "Allow":
            assert st["Action"] == "sns:Publish"
            assert set(st["Condition"]["StringEquals"]) == {"aws:SourceAccount"}
            publishers[st["Principal"]["Service"]] = st
    assert set(publishers) == {"cloudwatch.amazonaws.com", "budgets.amazonaws.com"}


def test_the_owner_email_subscribes_only_when_given(template: Template, tmp_path: Path) -> None:
    (sub,) = template.find_resources("AWS::SNS::Subscription").values()
    assert sub["Properties"]["Protocol"] == "email" and sub["Properties"]["Endpoint"] == "owner@example.com"
    assert synth(tmp_path).find_resources("AWS::SNS::Subscription") == {}


def test_both_lambdas_log_json(template: Template) -> None:
    fns = [f["Properties"] for f in template.find_resources("AWS::Lambda::Function").values() if "FunctionName" in f["Properties"]]
    assert len(fns) == 3
    for props in fns:
        assert props["LoggingConfig"]["LogFormat"] == "JSON"


def test_analytics_runs_nightly_from_the_same_image_and_may_only_connect_to_dsql(template: Template) -> None:
    fns = template.find_resources("AWS::Lambda::Function")
    ((name, fn),) = [(n, f) for n, f in fns.items() if f["Properties"].get("FunctionName") == ANALYTICS_FUNCTION_NAME]
    props = fn["Properties"]
    assert props["ImageConfig"]["Command"] == ["kestrel_analytics.nightly.handler"]
    assert props["Architectures"] == ["arm64"] and props["Timeout"] == 300
    assert set(props["Environment"]["Variables"]) == {"DSQL_ENDPOINT"}
    (schedule,) = template.find_resources("AWS::Scheduler::Schedule").values()
    assert schedule["Properties"]["ScheduleExpression"] == "cron(0 7 * * ? *)"
    assert schedule["Properties"]["Target"]["Arn"] == {"Fn::GetAtt": [name, "Arn"]}
    role = props["Role"]["Fn::GetAtt"][0]
    actions = set()
    for policy in template.find_resources("AWS::IAM::Policy").values():
        if {"Ref": role} in policy["Properties"]["Roles"]:
            for st in policy["Properties"]["PolicyDocument"]["Statement"]:
                actions |= set(st["Action"] if isinstance(st["Action"], list) else [st["Action"]])
    assert actions == {"dsql:DbConnect"}
