import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, Eye, CheckCircle2, XCircle } from "lucide-react";
import type { NewsArticle } from "@shared/schema";
import { format } from "date-fns";

export default function AdminNewsPage() {
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [targetKeywords, setTargetKeywords] = useState("AEO indexing, AEO improvements, AEO optimisation, AEO listings");
  const [editTitle, setEditTitle] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editMetaDesc, setEditMetaDesc] = useState("");
  const [editKeywordsText, setEditKeywordsText] = useState("");
  const [editContent, setEditContent] = useState("");
  const { toast } = useToast();

  const { data: articles = [], isLoading } = useQuery<NewsArticle[]>({
    queryKey: ["/api/admin/news"],
  });

  const generateMutation = useMutation({
    mutationFn: async (data: { prompt: string; targetKeywords?: string[] }) => {
      return apiRequest("POST", "/api/admin/news/generate", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/news"] });
      setGenerateDialogOpen(false);
      setGeneratePrompt("");
      toast({
        title: "Success",
        description: "Article generated successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to generate article",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: number; updates: Partial<NewsArticle> }) => {
      return apiRequest("PATCH", `/api/admin/news/${data.id}`, data.updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/news"] });
      setEditDialogOpen(false);
      setSelectedArticle(null);
      toast({
        title: "Success",
        description: "Article updated successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update article",
      });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (data: { id: number; isPublished: boolean }) => {
      return apiRequest("PATCH", `/api/admin/news/${data.id}/publish`, { isPublished: data.isPublished });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/news"] });
      toast({
        title: "Success",
        description: "Article status updated!",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update article status",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/admin/news/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/news"] });
      setDeleteDialogOpen(false);
      setSelectedArticle(null);
      toast({
        title: "Success",
        description: "Article deleted successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete article",
      });
    },
  });

  const handleGenerate = () => {
    if (!generatePrompt.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter a prompt",
      });
      return;
    }

    const keywords = targetKeywords
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    generateMutation.mutate({
      prompt: generatePrompt,
      targetKeywords: keywords.length > 0 ? keywords : undefined,
    });
  };

  const handlePublishToggle = (article: NewsArticle) => {
    publishMutation.mutate({
      id: article.id,
      isPublished: !article.isPublished,
    });
  };

  const handleDelete = () => {
    if (selectedArticle) {
      deleteMutation.mutate(selectedArticle.id);
    }
  };

  const handleOpenEdit = (article: NewsArticle) => {
    setSelectedArticle(article);
    setEditTitle(article.title);
    setEditSlug(article.slug);
    setEditMetaDesc(article.metaDescription || "");
    const kw = article.keywords;
    setEditKeywordsText(Array.isArray(kw) ? kw.join(", ") : String(kw ?? ""));
    setEditContent(article.content);
    setEditDialogOpen(true);
  };

  // Sync form fields when selectedArticle changes — safety net for dialog timing
  useEffect(() => {
    if (selectedArticle && editDialogOpen) {
      setEditTitle(selectedArticle.title);
      setEditSlug(selectedArticle.slug);
      setEditMetaDesc(selectedArticle.metaDescription || "");
      const kw = selectedArticle.keywords;
      setEditKeywordsText(Array.isArray(kw) ? kw.join(", ") : String(kw ?? ""));
      setEditContent(selectedArticle.content);
    }
  }, [selectedArticle?.id, editDialogOpen]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
          <div>
            <CardTitle data-testid="text-page-title">News Article Management</CardTitle>
            <CardDescription>Manage SEO-optimized news articles with AI-powered generation</CardDescription>
          </div>
          <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-generate-article">
                <Plus className="h-4 w-4 mr-2" />
                Generate Article
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Generate AI-Powered Article</DialogTitle>
                <DialogDescription>
                  Provide a topic or prompt, and ChatGPT will generate a complete SEO-optimized article (1,500-2,500 words) with meta tags, questions, and key takeaways.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="prompt">Article Topic / Prompt</Label>
                  <Textarea
                    id="prompt"
                    data-testid="input-article-prompt"
                    placeholder="E.g., 'How Answer Engine Optimization is revolutionizing brand visibility in 2025'"
                    value={generatePrompt}
                    onChange={(e) => setGeneratePrompt(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="keywords">Target Keywords (comma-separated)</Label>
                  <Input
                    id="keywords"
                    data-testid="input-target-keywords"
                    placeholder="AEO indexing, AEO improvements, AEO optimisation, AEO listings"
                    value={targetKeywords}
                    onChange={(e) => setTargetKeywords(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setGenerateDialogOpen(false)}
                  disabled={generateMutation.isPending}
                  data-testid="button-cancel-generate"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={generateMutation.isPending}
                  data-testid="button-confirm-generate"
                >
                  {generateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {generateMutation.isPending ? "Generating..." : "Generate Article"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {articles.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No articles yet. Generate your first AI-powered article!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Keywords</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {articles.map((article) => (
                    <TableRow key={article.id} data-testid={`row-article-${article.id}`}>
                      <TableCell className="font-medium max-w-md">
                        <div className="truncate" data-testid={`text-article-title-${article.id}`}>
                          {article.title}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">/{article.slug}</div>
                      </TableCell>
                      <TableCell>
                        {article.isPublished ? (
                          <Badge variant="default" data-testid={`badge-status-${article.id}`}>
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Published
                          </Badge>
                        ) : (
                          <Badge variant="secondary" data-testid={`badge-status-${article.id}`}>
                            <XCircle className="h-3 w-3 mr-1" />
                            Draft
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {article.keywords?.slice(0, 3).map((keyword, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {keyword}
                            </Badge>
                          ))}
                          {(article.keywords?.length || 0) > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{(article.keywords?.length || 0) - 3} more
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {article.createdAt ? format(new Date(article.createdAt), "MMM d, yyyy") : "N/A"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => window.open(`/news/${article.slug}`, "_blank")}
                            data-testid={`button-preview-${article.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenEdit(article)}
                            data-testid={`button-edit-${article.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant={article.isPublished ? "outline" : "default"}
                            onClick={() => handlePublishToggle(article)}
                            disabled={publishMutation.isPending}
                            data-testid={`button-publish-${article.id}`}
                          >
                            {article.isPublished ? "Unpublish" : "Publish"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedArticle(article);
                              setDeleteDialogOpen(true);
                            }}
                            data-testid={`button-delete-${article.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Article</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedArticle?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
              className="bg-destructive text-destructive-foreground hover-elevate"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Article</DialogTitle>
            <DialogDescription>
              Update the article details below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                data-testid="input-edit-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-slug">Slug</Label>
              <Input
                id="edit-slug"
                value={editSlug}
                onChange={(e) => setEditSlug(e.target.value)}
                data-testid="input-edit-slug"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-meta-desc">Meta Description</Label>
              <Textarea
                id="edit-meta-desc"
                value={editMetaDesc}
                onChange={(e) => setEditMetaDesc(e.target.value)}
                rows={2}
                className="resize-none"
                data-testid="input-edit-meta-desc"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-keywords">Keywords (comma-separated)</Label>
              <Input
                id="edit-keywords"
                value={editKeywordsText}
                onChange={(e) => setEditKeywordsText(e.target.value)}
                placeholder="keyword1, keyword2, keyword3"
                data-testid="input-edit-keywords"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-content">Content</Label>
              <Textarea
                id="edit-content"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={16}
                data-testid="input-edit-content"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={updateMutation.isPending}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!selectedArticle) return;
                const keywords = editKeywordsText
                  .split(",")
                  .map((k) => k.trim())
                  .filter((k) => k.length > 0);
                updateMutation.mutate({
                  id: selectedArticle.id,
                  updates: {
                    title: editTitle,
                    slug: editSlug,
                    metaDescription: editMetaDesc,
                    keywords,
                    content: editContent,
                  },
                });
              }}
              disabled={updateMutation.isPending || !editTitle || !editContent}
              data-testid="button-save-edit"
            >
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
