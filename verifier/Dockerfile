# The verifier Lambda (arm64). Built by CDK from the repo root, so the image can
# carry the pinned robot assets; infra/kestrel_infra/stack.py limits the build
# context to verifier/ and apps/web/public/microduck. The layout mirrors the
# repo, which is where kestrel_verifier/scene.py looks for both.
FROM public.ecr.aws/lambda/python:3.12
COPY verifier/requirements.txt ${LAMBDA_TASK_ROOT}/verifier/requirements.txt
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/verifier/requirements.txt
COPY apps/web/public/microduck ${LAMBDA_TASK_ROOT}/apps/web/public/microduck
COPY verifier/kits ${LAMBDA_TASK_ROOT}/verifier/kits
COPY verifier/kestrel_verifier ${LAMBDA_TASK_ROOT}/verifier/kestrel_verifier
ENV PYTHONPATH=${LAMBDA_TASK_ROOT}/verifier
CMD ["kestrel_verifier.handler.handler"]
