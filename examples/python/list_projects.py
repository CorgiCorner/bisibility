import os

from bisibility import BisibilityClient

api_key = os.environ["BISIBILITY_API_KEY"]
base_url = os.environ["BISIBILITY_BASE_URL"]

with BisibilityClient(api_key=api_key, base_url=base_url) as client:
    projects = client.list_projects()

    for project in projects.data:
        print(project.id, project.name)

print("OK python-list-projects")
