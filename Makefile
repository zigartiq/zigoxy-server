.PHONY: build deploy

build:
	docker build -t <region>-docker.pkg.dev/<project>/<repo>/<image> .

push:
	docker push <region>-docker.pkg.dev/<project>/<repo>/<image>:latest

deploy:
	gcloud run deploy zigoxy-server \
		--image <region>-docker.pkg.dev/<project>/<repo>/<image> \
		--platform managed \
		--region <region> \
		--timeout 60m \
		--set-env-vars NODE_ENV=production
