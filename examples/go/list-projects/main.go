package main

import (
	"context"
	"fmt"
	"os"

	bisibility "bisibility.com/sdk-go"
)

func main() {
	apiKey := os.Getenv("BISIBILITY_API_KEY")
	baseURL := os.Getenv("BISIBILITY_BASE_URL")
	if apiKey == "" || baseURL == "" {
		fmt.Fprintln(os.Stderr, "Set BISIBILITY_API_KEY and BISIBILITY_BASE_URL before running this example.")
		os.Exit(1)
	}

	client, err := bisibility.NewClient(
		bisibility.WithAPIKey(apiKey),
		bisibility.WithBaseURL(baseURL),
	)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	projects, err := client.ListProjects(context.Background())
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	for _, project := range projects.Data {
		fmt.Println(project.ID, project.Domain)
	}

	fmt.Println("OK go-list-projects")
}
